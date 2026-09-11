import type { Metadata } from "next";
import Link from "next/link";
import { RateLimitForm, RetentionForm } from "@/components/admin/SettingsForms";
import { Badge, Card, Cell, PageHeader, StatTile, Table } from "@/components/admin/ui";
import { requireAdminDb } from "@/lib/ai/admin-client";
import { monthToDateSpend } from "@/lib/ai/budget";
import { requireAdmin } from "@/lib/admin/auth";
import { rateLimitSettings, retentionSettings } from "@/lib/admin/settings";
import { money } from "@/lib/admin/analytics";

/**
 * Keys, limits, retention, and the budget.
 *
 * No key is ever rendered here, only whether it is set. A settings screen that
 * shows a secret turns every screenshot, every screen share and every browser
 * history into a place that secret now lives — and there is nothing an operator
 * can do with the value that they cannot do with "it is configured".
 *
 * Keys are environment variables rather than database rows for the same reason:
 * a row can be read by anything that reaches the database, and the assistant's
 * whole security model is that its tables are unreachable except by the server.
 * Adding the keys to those tables would make that model load-bearing for the
 * keys too.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireAdmin("configure");

  const db = requireAdminDb();

  const [limits, retention, spend, { data: budgetRows }, { count: conversations }] =
    await Promise.all([
      rateLimitSettings(),
      retentionSettings(),
      monthToDateSpend(),
      db.from("model_config").select("channel, monthly_budget_usd"),
      db.from("conversations").select("id", { count: "exact", head: true }),
    ]);

  const budgets = ((budgetRows ?? []) as Record<string, unknown>[])
    .map((row) => Number(row.monthly_budget_usd ?? 0))
    .filter((value) => value > 0);

  const cap = budgets.length > 0 ? Math.min(...budgets) : null;

  const keys: { label: string; env: string; set: boolean; why: string }[] = [
    {
      label: "Supabase service role",
      env: "SUPABASE_SERVICE_ROLE_KEY",
      set: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      why: "Required. Every assistant table has row level security with no policy, so nothing else can read them.",
    },
    {
      label: "OpenRouter",
      env: "OPENROUTER_API_KEY",
      set: Boolean(process.env.OPENROUTER_API_KEY),
      why: "Required. Every response model is reached through it.",
    },
    {
      label: "OpenAI",
      env: "OPENAI_API_KEY",
      set: Boolean(process.env.OPENAI_API_KEY),
      why: "Embeddings, if OpenAI is the selected provider.",
    },
    {
      label: "Cohere",
      env: "COHERE_API_KEY",
      set: Boolean(process.env.COHERE_API_KEY),
      why: "Embeddings and reranking, if Cohere is selected.",
    },
    {
      label: "Google",
      env: "GOOGLE_API_KEY",
      set: Boolean(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY),
      why: "Embeddings, if Google is selected.",
    },
    {
      label: "Voyage",
      env: "VOYAGE_API_KEY",
      set: Boolean(process.env.VOYAGE_API_KEY),
      why: "Embeddings, if Voyage is selected.",
    },
    {
      label: "Telegram bot",
      env: "TELEGRAM_BOT_TOKEN",
      set: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      why: "The Telegram channel.",
    },
    {
      label: "Telegram webhook secret",
      env: "TELEGRAM_WEBHOOK_SECRET",
      set: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
      why: "Proves an update came from Telegram. Without it the webhook is not registered at all.",
    },
    {
      label: "Resend",
      env: "RESEND_API_KEY",
      set: Boolean(process.env.RESEND_API_KEY),
      why: "Emails the firm when a lead arrives. Without it the lead is still saved and logged.",
    },
  ];

  return (
    <>
      <PageHeader
        title="Settings"
        description="Keys, limits and retention."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Spend this month"
          value={money(spend)}
          hint={cap ? `Cap ${money(cap)}` : "No cap set"}
        />
        <StatTile
          label="Budget"
          value={cap ? `${Math.round((spend / cap) * 100)}%` : "—"}
          hint={
            cap
              ? spend >= cap
                ? "Over. Answers are running on the cheapest capable model."
                : "Of the lowest cap set on any channel"
              : "Set one on the response model page"
          }
        />
        <StatTile label="Conversations stored" value={String(conversations ?? 0)} />
      </div>

      {cap !== null && spend >= cap && (
        <Card>
          <p role="alert" className="text-caption text-clay">
            The monthly cap has been passed. The assistant keeps answering — on the
            cheapest capable model — rather than going quiet, because a visitor turned
            away costs more than the fraction of a cent it saves. Raise the cap on the{" "}
            <Link href="/admin/models" className="underline underline-offset-4">
              response model
            </Link>{" "}
            page to restore the usual model.
          </p>
        </Card>
      )}

      <Card
        title="API keys"
        description="Set as environment variables, never stored in the database and never shown here."
      >
        <Table head={["Key", "Variable", "Status", "What it is for"]}>
          {keys.map((key) => (
            <tr key={key.env}>
              <Cell className="font-medium text-ink">{key.label}</Cell>
              <Cell className="font-mono text-slate">{key.env}</Cell>
              <Cell>
                <Badge tone={key.set ? "good" : "neutral"}>
                  {key.set ? "Set" : "Not set"}
                </Badge>
              </Cell>
              <Cell className="max-w-md text-slate">{key.why}</Cell>
            </tr>
          ))}
        </Table>
      </Card>

      <RateLimitForm windowSeconds={limits.windowSeconds} max={limits.max} />

      <RetentionForm days={retention.conversationDays} />

      <Card title="What the browser can reach">
        <p className="text-caption text-slate">
          Nothing. Every assistant table has row level security enabled and not one
          policy, so the publishable key that ships to visitors reaches the knowledge
          base, the conversations, the leads and this page&apos;s settings alike — which
          is to say, none of them. The only exception is the website form&apos;s
          insert-only policy on <code className="rounded bg-sand/70 px-1">leads</code>,
          which allows a row to be added and never read back.
        </p>
      </Card>
    </>
  );
}
