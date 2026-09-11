import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConversationControls } from "@/components/admin/ConversationControls";
import { Badge, Card, PageHeader } from "@/components/admin/ui";
import { requireAdminDb } from "@/lib/ai/admin-client";
import { requireAdmin } from "@/lib/admin/auth";
import { can } from "@/lib/admin/roles";
import { channelLabel, statusLabel, when } from "@/lib/admin/labels";

/**
 * One conversation, with the working shown.
 *
 * Every assistant message lists the passages it retrieved, the model that wrote
 * it, what it cost and how long it took. That is the whole point of this
 * screen: when an answer is wrong, the question is almost never "why did the
 * model say that" and almost always "what was it given" — and without the
 * retrieved passages in front of you, that is unanswerable.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Conversation" };

type MessageRow = {
  id: string;
  role: string;
  content: string;
  model_used: string | null;
  provider: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_usd: string | number | null;
  latency_ms: number | null;
  top_similarity: number | null;
  retrieved_chunk_ids: string[];
  finish_reason: string | null;
  error: string | null;
  created_at: string;
};

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireAdmin("read");
  const { id } = await params;

  const db = requireAdminDb();

  const { data: conversationRow } = await db
    .from("conversations")
    .select(
      "id, channel, status, handoff_reason, summary, flagged, message_count, started_at, updated_at, user_id",
    )
    .eq("id", id)
    .maybeSingle();

  const conversation = conversationRow as Record<string, unknown> | null;
  if (!conversation) notFound();

  const [{ data: messageRows }, { data: visitor }, { data: lead }] = await Promise.all([
    db
      .from("messages")
      .select(
        "id, role, content, model_used, provider, tokens_in, tokens_out, cost_usd, latency_ms, top_similarity, retrieved_chunk_ids, finish_reason, error, created_at",
      )
      .eq("conversation_id", id)
      .order("created_at", { ascending: true }),
    db
      .from("unified_users")
      .select("external_id, name, email, phone, first_seen")
      .eq("id", (conversation.user_id as string) ?? "")
      .maybeSingle(),
    db
      .from("leads")
      .select("id, full_name, business_name, created_at")
      .eq("conversation_id", id)
      .maybeSingle(),
  ]);

  const messages = (messageRows ?? []) as MessageRow[];

  // One query for every passage cited anywhere in the thread, rather than one
  // per message: a long conversation would otherwise be forty round trips.
  const chunkIds = [...new Set(messages.flatMap((message) => message.retrieved_chunk_ids ?? []))];

  const passages = new Map<string, { title: string; content: string }>();

  if (chunkIds.length > 0) {
    const { data: chunkRows } = await db
      .from("chunks")
      .select("id, content, documents(title)")
      .in("id", chunkIds);

    for (const row of (chunkRows ?? []) as Record<string, unknown>[]) {
      const document = row.documents as { title?: string } | null;
      passages.set(String(row.id), {
        title: document?.title ?? "Deleted source",
        content: String(row.content ?? ""),
      });
    }
  }

  const status = String(conversation.status);

  return (
    <>
      <PageHeader
        title="Conversation"
        description={`${channelLabel(String(conversation.channel))} · started ${when(String(conversation.started_at))}`}
        actions={
          <Link
            href="/admin/inbox"
            className="text-caption font-medium text-pine underline underline-offset-4"
          >
            Back to the inbox
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={status === "needs_human" ? "bad" : status === "active" ? "good" : "neutral"}>
          {statusLabel(status)}
        </Badge>
        {conversation.flagged === true && <Badge tone="warn">Flagged</Badge>}
        {lead && (
          <Badge tone="good">
            Lead captured — {(lead as { business_name?: string }).business_name}
          </Badge>
        )}
      </div>

      {conversation.handoff_reason && (
        <Card title="Why it was handed over">
          <p className="text-caption text-ink">{String(conversation.handoff_reason)}</p>
        </Card>
      )}

      {can(admin.role, "operate") && (
        <ConversationControls
          conversationId={id}
          status={status}
          flagged={conversation.flagged === true}
        />
      )}

      {visitor && (
        <Card title="Visitor">
          <dl className="grid gap-3 text-caption sm:grid-cols-4">
            <Detail label="Identifier" value={String((visitor as { external_id?: string }).external_id ?? "—")} />
            <Detail label="Name" value={(visitor as { name?: string }).name ?? "—"} />
            <Detail label="Email" value={(visitor as { email?: string }).email ?? "—"} />
            <Detail label="Phone" value={(visitor as { phone?: string }).phone ?? "—"} />
          </dl>
        </Card>
      )}

      {conversation.summary && (
        <Card
          title="Rolling summary"
          description="What the model is told about the earlier turns it can no longer see."
        >
          <p className="whitespace-pre-wrap text-caption text-slate">
            {String(conversation.summary)}
          </p>
        </Card>
      )}

      <Card title="Transcript">
        <ol className="flex flex-col gap-4">
          {messages.map((message) => (
            <li key={message.id} className="border-b border-sand/70 pb-4 last:border-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-eyebrow uppercase text-slate">
                  {message.role === "user"
                    ? "Visitor"
                    : message.provider === "operator"
                      ? "Operator"
                      : "Assistant"}
                </span>
                <span className="text-caption text-slate">{when(message.created_at)}</span>
              </div>

              <p className="mt-2 whitespace-pre-wrap text-caption text-ink">
                {message.content || <em className="text-slate">No text was produced.</em>}
              </p>

              {message.error && (
                <p className="mt-2 text-caption text-clay">Error: {message.error}</p>
              )}

              {message.role === "assistant" && message.model_used && (
                <p className="mt-2 text-caption text-slate">
                  {message.model_used} · {message.tokens_in ?? 0} in / {message.tokens_out ?? 0}{" "}
                  out · {formatCost(message.cost_usd)} ·{" "}
                  {message.latency_ms ? `${(message.latency_ms / 1000).toFixed(1)}s` : "—"}
                  {message.top_similarity !== null && (
                    <> · best match {message.top_similarity.toFixed(3)}</>
                  )}
                  {message.finish_reason && message.finish_reason !== "stop" && (
                    <> · finished: {message.finish_reason}</>
                  )}
                </p>
              )}

              {message.retrieved_chunk_ids?.length > 0 && (
                <details className="mt-2">
                  <summary className="inline-flex min-h-11 cursor-pointer items-center text-caption font-medium text-pine underline underline-offset-4">
                    Passages used ({message.retrieved_chunk_ids.length})
                  </summary>
                  <ol className="mt-2 flex flex-col gap-2 border-s-2 border-sand ps-3">
                    {message.retrieved_chunk_ids.map((chunkId) => {
                      const passage = passages.get(chunkId);

                      return (
                        <li key={chunkId} className="text-caption">
                          <p className="font-semibold text-ink">
                            {passage?.title ?? "Deleted source"}
                          </p>
                          <p className="whitespace-pre-wrap text-slate">
                            {passage
                              ? passage.content.slice(0, 500)
                              : "This passage has since been removed from the knowledge base."}
                          </p>
                        </li>
                      );
                    })}
                  </ol>
                </details>
              )}

              {message.role === "assistant" &&
                message.model_used &&
                message.retrieved_chunk_ids?.length === 0 && (
                  <p className="mt-2 text-caption text-slate">
                    Nothing in the knowledge base matched, so the assistant was told to
                    say it does not know.
                  </p>
                )}
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-eyebrow uppercase text-slate">{label}</dt>
      <dd className="mt-1 break-words text-ink">{value}</dd>
    </div>
  );
}

function formatCost(value: string | number | null): string {
  if (value === null) return "cost unknown";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "cost unknown";
  return amount < 0.01 ? `$${amount.toFixed(5)}` : `$${amount.toFixed(2)}`;
}
