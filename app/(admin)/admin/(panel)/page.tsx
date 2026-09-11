import Link from "next/link";
import {
  Badge,
  Card,
  Cell,
  Empty,
  PageHeader,
  StatTile,
  Table,
} from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin/auth";
import { channelLabel } from "@/lib/admin/labels";
import {
  byChannel,
  count,
  isWindow,
  modelCosts,
  money,
  overview,
  percent,
  topSources,
  unansweredQuestions,
  WINDOWS,
  type Window,
} from "@/lib/admin/analytics";

/**
 * The dashboard.
 *
 * Ordered by what an operator actually needs to know, in order: is it being
 * used, is it producing leads, are the answers any good, and what is it
 * costing. Everything else is a link away.
 *
 * Rates over an empty period render as "—" rather than 0%. A satisfaction score
 * of zero per cent and a satisfaction score nobody has voted on are different
 * facts, and a dashboard that renders them identically teaches its reader to
 * distrust it.
 */

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireAdmin("read");

  const params = await searchParams;
  const window: Window = isWindow(params.window) ? params.window : "30d";
  const denied = params.denied === "1";

  const [stats, channels, costs, sources, unanswered] = await Promise.all([
    overview(window),
    byChannel(window),
    modelCosts(window),
    topSources(window, 6),
    unansweredQuestions(window, 5),
  ]);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="How the assistant is being used, what it is producing, and what it costs."
        actions={<WindowPicker current={window} />}
      />

      {denied && (
        <p
          role="alert"
          className="rounded-card border border-clay/30 bg-clay/[0.06] px-4 py-3 text-caption text-clay"
        >
          That section is not available to your role. Ask an owner if you need access.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Conversations"
          value={count(stats.conversations)}
          hint={`${count(stats.visitors)} unique visitors`}
        />
        <StatTile
          label="Consultation requests"
          value={count(stats.leads)}
          hint={`${percent(stats.conversionRate)} of conversations`}
        />
        <StatTile
          label="Satisfaction"
          value={percent(stats.satisfaction)}
          hint={`${count(stats.thumbsUp)} up, ${count(stats.thumbsDown)} down`}
        />
        <StatTile
          label="Cost"
          value={money(stats.costUsd)}
          hint={`${count(stats.tokensIn + stats.tokensOut)} tokens`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Messages"
          value={count(stats.messages)}
          hint={`${stats.avgMessages} per conversation`}
        />
        <StatTile
          label="Average length"
          value={stats.avgMinutes > 0 ? `${stats.avgMinutes} min` : "—"}
          hint="Conversations of more than one message"
        />
        <StatTile
          label="Handed to a person"
          value={count(stats.handoffs)}
          hint="Conversations waiting or taken over"
        />
        <StatTile
          label="Unanswered"
          value={percent(stats.unansweredRate)}
          hint={`${count(stats.unanswered)} answers found no source`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="By channel" description="Where the conversations are happening.">
          <Table head={["Channel", "Conversations", "Visitors", "Messages", "Leads"]}>
            {channels.map((row) => (
              <tr key={row.channel}>
                <Cell>
                  <Badge>{channelLabel(row.channel)}</Badge>
                </Cell>
                <Cell className="tabular">{count(row.conversations)}</Cell>
                <Cell className="tabular">{count(row.visitors)}</Cell>
                <Cell className="tabular">{count(row.messages)}</Cell>
                <Cell className="tabular">{count(row.leads)}</Cell>
              </tr>
            ))}
          </Table>
        </Card>

        <Card
          title="Cost by model"
          description="Priced when the answer was produced, so a later price change cannot rewrite it."
        >
          {costs.length === 0 ? (
            <Empty>No answers in this period.</Empty>
          ) : (
            <Table head={["Model", "Answers", "Tokens in", "Tokens out", "Cost"]}>
              {costs.map((row) => (
                <tr key={row.model}>
                  <Cell className="font-medium text-ink">{row.model}</Cell>
                  <Cell className="tabular">{count(row.answers)}</Cell>
                  <Cell className="tabular">{count(row.tokensIn)}</Cell>
                  <Cell className="tabular">{count(row.tokensOut)}</Cell>
                  <Cell className="tabular">{money(row.costUsd)}</Cell>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="Most asked about"
          description="Which sources the retriever keeps reaching for — a count of what happened, rather than a guess at what people meant."
        >
          {sources.length === 0 ? (
            <Empty>Nothing has been retrieved yet.</Empty>
          ) : (
            <ul className="flex flex-col divide-y divide-sand/70">
              {sources.map((source) => (
                <li
                  key={source.documentId}
                  className="flex items-center justify-between gap-4 py-2.5"
                >
                  <span className="text-caption text-ink">{source.title}</span>
                  <span className="tabular text-caption text-slate">
                    {count(source.citations)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Questions with no answer"
          description="The knowledge base's backlog."
          footer={
            <Link
              href="/admin/feedback"
              className="text-caption font-medium text-pine underline underline-offset-4"
            >
              See all of them
            </Link>
          }
        >
          {unanswered.length === 0 ? (
            <Empty>Every question found a source. </Empty>
          ) : (
            <ul className="flex flex-col divide-y divide-sand/70">
              {unanswered.map((item, i) => (
                <li key={`${item.conversationId}-${i}`} className="py-2.5">
                  <p className="text-caption text-ink">{item.question}</p>
                  <p className="mt-1 text-caption text-slate">
                    {channelLabel(item.channel)} ·{" "}
                    {new Date(item.askedAt).toLocaleString("en-GB")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function WindowPicker({ current }: { current: Window }) {
  return (
    <nav aria-label="Reporting period" className="flex flex-wrap gap-1">
      {WINDOWS.map((option) => {
        const active = option.value === current;

        return (
          <Link
            key={option.value}
            href={`/admin?window=${option.value}`}
            aria-current={active ? "true" : undefined}
            className={`inline-flex min-h-11 items-center rounded-btn px-3 text-caption font-medium transition-colors duration-200 ${
              active
                ? "bg-pine text-bone"
                : "border border-sand bg-white text-slate hover:text-pine"
            }`}
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}
