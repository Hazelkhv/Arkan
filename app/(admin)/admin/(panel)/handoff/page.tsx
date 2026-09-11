import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, Cell, Empty, PageHeader, Table } from "@/components/admin/ui";
import { requireAdminDb } from "@/lib/ai/admin-client";
import { requireAdmin } from "@/lib/admin/auth";
import { channelLabel, statusLabel, when } from "@/lib/admin/labels";

/**
 * The queue: conversations where the assistant stepped aside.
 *
 * Waiting first, oldest at the top. A queue sorted newest-first is one where
 * the person who has been waiting longest is the last one anybody sees, and
 * this queue exists because somebody asked to speak to a human.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Needs a person" };

type Row = {
  id: string;
  channel: string;
  status: string;
  handoff_reason: string | null;
  message_count: number;
  started_at: string;
  updated_at: string;
  assigned_to: string | null;
};

export default async function HandoffPage() {
  await requireAdmin("operate");

  const db = requireAdminDb();

  const [{ data: waitingRows }, { data: activeRows }] = await Promise.all([
    db
      .from("conversations")
      .select(
        "id, channel, status, handoff_reason, message_count, started_at, updated_at, assigned_to",
      )
      .eq("status", "needs_human")
      .order("updated_at", { ascending: true })
      .limit(100),
    db
      .from("conversations")
      .select(
        "id, channel, status, handoff_reason, message_count, started_at, updated_at, assigned_to",
      )
      .eq("status", "human_active")
      .order("updated_at", { ascending: false })
      .limit(100),
  ]);

  const waiting = (waitingRows ?? []) as Row[];
  const active = (activeRows ?? []) as Row[];

  return (
    <>
      <PageHeader
        title="Needs a person"
        description="Where a visitor asked for someone, or the assistant decided it could not help. The bot stays quiet on any conversation an operator has taken over."
      />

      <Card
        title={`Waiting (${waiting.length})`}
        description="Longest wait first."
      >
        {waiting.length === 0 ? (
          <Empty>Nobody is waiting.</Empty>
        ) : (
          <Queue rows={waiting} />
        )}
      </Card>

      <Card
        title={`Being answered (${active.length})`}
        description="Taken over by an operator. The assistant will not reply to these."
      >
        {active.length === 0 ? (
          <Empty>Nothing is being answered by a person right now.</Empty>
        ) : (
          <Queue rows={active} />
        )}
      </Card>
    </>
  );
}

function Queue({ rows }: { rows: Row[] }) {
  return (
    <Table head={["Waiting since", "Channel", "Status", "Why", ""]}>
      {rows.map((row) => (
        <tr key={row.id}>
          <Cell className="whitespace-nowrap text-slate">{when(row.updated_at)}</Cell>
          <Cell>
            <Badge>{channelLabel(row.channel)}</Badge>
          </Cell>
          <Cell>
            <Badge tone={row.status === "needs_human" ? "bad" : "warn"}>
              {statusLabel(row.status)}
            </Badge>
          </Cell>
          <Cell className="max-w-md text-ink">{row.handoff_reason ?? "—"}</Cell>
          <Cell>
            <Link
              href={`/admin/inbox/${row.id}`}
              className="font-medium text-pine underline underline-offset-4"
            >
              Open and reply
            </Link>
          </Cell>
        </tr>
      ))}
    </Table>
  );
}
