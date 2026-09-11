import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, Cell, Empty, PageHeader, StatTile, Table } from "@/components/admin/ui";
import { requireAdminDb } from "@/lib/ai/admin-client";
import { requireAdmin } from "@/lib/admin/auth";
import { unansweredQuestions, isWindow, percent, type Window } from "@/lib/admin/analytics";
import { channelLabel, when } from "@/lib/admin/labels";

/**
 * What went wrong, and what to do about it.
 *
 * Three lists, in the order they are worth acting on: answers a visitor marked
 * as unhelpful, conversations somebody flagged, and questions the knowledge
 * base could not answer at all. The third is the most useful and the least
 * dramatic — it is a to-do list for the knowledge base, and every item on it is
 * a visitor who was told "I don't have that detail".
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Feedback" };

type RatingRow = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  message_id: string;
};

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireAdmin("read");

  const params = await searchParams;
  const window: Window = isWindow(params.window) ? params.window : "30d";

  const db = requireAdminDb();

  const [{ data: ratingRows }, { data: flaggedRows }, unanswered, { count: up }, { count: down }] =
    await Promise.all([
      db
        .from("feedback")
        .select("id, rating, comment, created_at, message_id")
        .eq("rating", -1)
        .order("created_at", { ascending: false })
        .limit(50),
      db
        .from("conversations")
        .select("id, channel, updated_at, message_count")
        .eq("flagged", true)
        .order("updated_at", { ascending: false })
        .limit(50),
      unansweredQuestions(window, 100),
      db.from("feedback").select("id", { count: "exact", head: true }).eq("rating", 1),
      db.from("feedback").select("id", { count: "exact", head: true }).eq("rating", -1),
    ]);

  const ratings = (ratingRows ?? []) as RatingRow[];
  const flagged = (flaggedRows ?? []) as {
    id: string;
    channel: string;
    updated_at: string;
    message_count: number;
  }[];

  // The rated answers, and the question that produced each of them.
  const pairs = new Map<
    string,
    { answer: string; question: string; conversationId: string }
  >();

  if (ratings.length > 0) {
    const { data: answerRows } = await db
      .from("messages")
      .select("id, content, conversation_id, created_at")
      .in(
        "id",
        ratings.map((row) => row.message_id),
      );

    for (const answer of (answerRows ?? []) as Record<string, unknown>[]) {
      const { data: questionRow } = await db
        .from("messages")
        .select("content")
        .eq("conversation_id", answer.conversation_id as string)
        .eq("role", "user")
        .lte("created_at", answer.created_at as string)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      pairs.set(String(answer.id), {
        answer: String(answer.content ?? ""),
        question: String((questionRow as { content?: string } | null)?.content ?? "—"),
        conversationId: String(answer.conversation_id),
      });
    }
  }

  const total = (up ?? 0) + (down ?? 0);

  return (
    <>
      <PageHeader
        title="Feedback"
        description="Where the assistant fell short, and what would fix it."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Satisfaction"
          value={total > 0 ? percent((up ?? 0) / total) : "—"}
          hint={`${up ?? 0} up, ${down ?? 0} down, all time`}
        />
        <StatTile label="Flagged conversations" value={String(flagged.length)} />
        <StatTile
          label="Questions with no source"
          value={String(unanswered.length)}
          hint="In the last 30 days"
        />
      </div>

      <Card
        title="Marked unhelpful"
        description="The answer, and the question that produced it."
      >
        {ratings.length === 0 ? (
          <Empty>Nobody has marked an answer unhelpful.</Empty>
        ) : (
          <ul className="flex flex-col divide-y divide-sand/70">
            {ratings.map((rating) => {
              const pair = pairs.get(rating.message_id);

              return (
                <li key={rating.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge tone="bad">Unhelpful</Badge>
                    <span className="text-caption text-slate">{when(rating.created_at)}</span>
                  </div>

                  <p className="mt-2 text-caption font-semibold text-ink">
                    {pair?.question ?? "The question is no longer stored."}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-caption text-slate">
                    {pair?.answer ?? "The answer has been deleted."}
                  </p>

                  {rating.comment && (
                    <p className="mt-2 rounded-card bg-bone/70 p-3 text-caption text-ink">
                      “{rating.comment}”
                    </p>
                  )}

                  {pair && (
                    <Link
                      href={`/admin/inbox/${pair.conversationId}`}
                      className="mt-2 inline-flex min-h-11 items-center text-caption font-medium text-pine underline underline-offset-4"
                    >
                      Open the conversation
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card
        title="Flagged for review"
        description="Conversations somebody marked as worth a second look."
      >
        {flagged.length === 0 ? (
          <Empty>Nothing is flagged.</Empty>
        ) : (
          <Table head={["Last activity", "Channel", "Messages", ""]}>
            {flagged.map((row) => (
              <tr key={row.id}>
                <Cell className="whitespace-nowrap text-slate">{when(row.updated_at)}</Cell>
                <Cell>
                  <Badge>{channelLabel(row.channel)}</Badge>
                </Cell>
                <Cell className="tabular">{row.message_count}</Cell>
                <Cell>
                  <Link
                    href={`/admin/inbox/${row.id}`}
                    className="font-medium text-pine underline underline-offset-4"
                  >
                    Open
                  </Link>
                </Cell>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card
        title="Questions the knowledge base could not answer"
        description="Each of these was answered with “I don't have that detail”. Adding a source that covers one turns it into a real answer next time."
        footer={
          <Link
            href="/admin/knowledge"
            className="text-caption font-medium text-pine underline underline-offset-4"
          >
            Add a source
          </Link>
        }
      >
        {unanswered.length === 0 ? (
          <Empty>Every question found a source.</Empty>
        ) : (
          <Table head={["Asked", "Channel", "Question", ""]}>
            {unanswered.map((item, index) => (
              <tr key={`${item.conversationId}-${index}`}>
                <Cell className="whitespace-nowrap text-slate">{when(item.askedAt)}</Cell>
                <Cell>
                  <Badge>{channelLabel(item.channel)}</Badge>
                </Cell>
                <Cell className="max-w-lg text-ink">{item.question}</Cell>
                <Cell>
                  <Link
                    href={`/admin/inbox/${item.conversationId}`}
                    className="font-medium text-pine underline underline-offset-4"
                  >
                    Context
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
