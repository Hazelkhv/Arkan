import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, Cell, Empty, PageHeader, Table, inputClass } from "@/components/admin/ui";
import { requireAdminDb } from "@/lib/ai/admin-client";
import { channels } from "@/lib/ai/types";
import { requireAdmin } from "@/lib/admin/auth";
import { channelLabel, statusLabel, when } from "@/lib/admin/labels";

/**
 * Every conversation, filterable.
 *
 * Search runs against the messages rather than the conversation row, because
 * what an operator remembers is something the visitor said — not a uuid and not
 * a timestamp. Matching messages are found first and their conversations are
 * listed, which is why the filter and the search are two queries rather than
 * one join.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Inbox" };

const PAGE_SIZE = 50;

type Row = {
  id: string;
  channel: string;
  status: string;
  title: string | null;
  summary: string | null;
  flagged: boolean;
  message_count: number;
  started_at: string;
  updated_at: string;
};

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireAdmin("read");

  const params = await searchParams;
  const channel = typeof params.channel === "string" ? params.channel : "";
  const status = typeof params.status === "string" ? params.status : "";
  const search = typeof params.q === "string" ? params.q.trim() : "";

  const db = requireAdminDb();

  let matchingIds: string[] | null = null;

  if (search) {
    // ilike rather than full text search: the volume here is a few thousand
    // messages, and a tsvector index would be one more thing to keep in step
    // with the data for no difference an operator could notice.
    const { data } = await db
      .from("messages")
      .select("conversation_id")
      .ilike("content", `%${search.replace(/[%_]/g, "")}%`)
      .limit(500);

    matchingIds = [
      ...new Set(((data ?? []) as { conversation_id: string }[]).map((row) => row.conversation_id)),
    ];
  }

  let query = db
    .from("conversations")
    .select(
      "id, channel, status, title, summary, flagged, message_count, started_at, updated_at",
    )
    .order("updated_at", { ascending: false })
    .limit(PAGE_SIZE);

  if (channel) query = query.eq("channel", channel);
  if (status) query = query.eq("status", status);
  if (matchingIds) {
    if (matchingIds.length === 0) matchingIds = ["00000000-0000-0000-0000-000000000000"];
    query = query.in("id", matchingIds);
  }

  const { data } = await query;
  const rows = (data ?? []) as Row[];

  return (
    <>
      <PageHeader
        title="Inbox"
        description="Every conversation, on every channel. Open one to see the passages behind each answer."
      />

      <Card>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="min-w-[14rem] flex-1">
            <label htmlFor="q" className="mb-1.5 block text-caption font-semibold text-ink">
              Search what was said
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={search}
              placeholder="pricing, timeline, a name…"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="channel" className="mb-1.5 block text-caption font-semibold text-ink">
              Channel
            </label>
            <select id="channel" name="channel" defaultValue={channel} className={inputClass}>
              <option value="">All</option>
              {channels.map((value) => (
                <option key={value} value={value}>
                  {channelLabel(value)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="status" className="mb-1.5 block text-caption font-semibold text-ink">
              Status
            </label>
            <select id="status" name="status" defaultValue={status} className={inputClass}>
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="needs_human">Needs a person</option>
              <option value="human_active">Operator replying</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          <button
            type="submit"
            className="inline-flex min-h-11 items-center rounded-btn bg-pine px-5 text-[0.9375rem] font-semibold text-bone hover:bg-[#0f2c26]"
          >
            Filter
          </button>
        </form>
      </Card>

      <Card>
        {rows.length === 0 ? (
          <Empty>
            {search || channel || status
              ? "No conversation matches that."
              : "No conversations yet."}
          </Empty>
        ) : (
          <Table head={["Started", "Channel", "Status", "Messages", "Opening"]}>
            {rows.map((row) => (
              <tr key={row.id}>
                <Cell className="whitespace-nowrap text-slate">{when(row.started_at)}</Cell>
                <Cell>
                  <Badge>{channelLabel(row.channel)}</Badge>
                </Cell>
                <Cell>
                  <Badge tone={toneFor(row.status)}>{statusLabel(row.status)}</Badge>
                  {row.flagged && (
                    <span className="ms-2">
                      <Badge tone="warn">Flagged</Badge>
                    </span>
                  )}
                </Cell>
                <Cell className="tabular">{row.message_count}</Cell>
                <Cell>
                  <Link
                    href={`/admin/inbox/${row.id}`}
                    className="font-medium text-pine underline underline-offset-4"
                  >
                    {row.title ?? row.summary?.slice(0, 80) ?? "Open the conversation"}
                  </Link>
                </Cell>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}

function toneFor(status: string): "good" | "warn" | "bad" | "neutral" {
  if (status === "needs_human") return "bad";
  if (status === "human_active") return "warn";
  if (status === "active") return "good";
  return "neutral";
}
