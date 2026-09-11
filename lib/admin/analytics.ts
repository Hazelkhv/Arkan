import { requireAdminDb } from "@/lib/ai/admin-client";

/**
 * The dashboard's numbers, read from the reporting functions in
 * supabase/assistant-analytics.sql.
 *
 * Nothing is computed here beyond ratios: the aggregation happens in Postgres,
 * and this module's job is to turn a row of bigints into something a screen can
 * render — including the honest empty states, where a rate over zero
 * conversations is `null` rather than 0%.
 */

export type Window = "1d" | "7d" | "30d" | "all";

export const WINDOWS: { value: Window; label: string }[] = [
  { value: "1d", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "all", label: "All time" },
];

export function since(window: Window): string {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  if (window === "all") return new Date(0).toISOString();
  if (window === "1d") return new Date(now - day).toISOString();
  if (window === "7d") return new Date(now - 7 * day).toISOString();
  return new Date(now - 30 * day).toISOString();
}

export function isWindow(value: unknown): value is Window {
  return value === "1d" || value === "7d" || value === "30d" || value === "all";
}

export type Overview = {
  conversations: number;
  visitors: number;
  messages: number;
  visitorMessages: number;
  leads: number;
  handoffs: number;
  thumbsUp: number;
  thumbsDown: number;
  unanswered: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  avgMessages: number;
  avgMinutes: number;
  /** Null when there were no conversations: 0% would be a claim, not a fact. */
  conversionRate: number | null;
  /** Null until somebody has actually rated an answer. */
  satisfaction: number | null;
  /** Share of answers that found nothing in the knowledge base. */
  unansweredRate: number | null;
};

export async function overview(window: Window): Promise<Overview> {
  const db = requireAdminDb();
  const { data, error } = await db.rpc("assistant_overview", { p_since: since(window) });

  if (error) throw new Error(`Dashboard query failed: ${error.message}`);

  const row = (Array.isArray(data) ? data[0] : data) ?? {};
  const n = (key: string) => Number((row as Record<string, unknown>)[key] ?? 0);

  const conversations = n("conversations");
  const ratings = n("thumbs_up") + n("thumbs_down");
  const assistantAnswers = n("messages") - n("visitor_messages");

  return {
    conversations,
    visitors: n("visitors"),
    messages: n("messages"),
    visitorMessages: n("visitor_messages"),
    leads: n("leads"),
    handoffs: n("handoffs"),
    thumbsUp: n("thumbs_up"),
    thumbsDown: n("thumbs_down"),
    unanswered: n("unanswered"),
    tokensIn: n("tokens_in"),
    tokensOut: n("tokens_out"),
    costUsd: n("cost_usd"),
    avgMessages: n("avg_messages"),
    avgMinutes: n("avg_minutes"),
    conversionRate: conversations > 0 ? n("leads") / conversations : null,
    satisfaction: ratings > 0 ? n("thumbs_up") / ratings : null,
    unansweredRate: assistantAnswers > 0 ? n("unanswered") / assistantAnswers : null,
  };
}

export type ChannelRow = {
  channel: string;
  conversations: number;
  visitors: number;
  messages: number;
  leads: number;
};

export async function byChannel(window: Window): Promise<ChannelRow[]> {
  const { data } = await requireAdminDb().rpc("assistant_by_channel", {
    p_since: since(window),
  });

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    channel: String(row.channel),
    conversations: Number(row.conversations ?? 0),
    visitors: Number(row.visitors ?? 0),
    messages: Number(row.messages ?? 0),
    leads: Number(row.leads ?? 0),
  }));
}

export type ModelCost = {
  model: string;
  answers: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
};

export async function modelCosts(window: Window): Promise<ModelCost[]> {
  const { data } = await requireAdminDb().rpc("assistant_model_costs", {
    p_since: since(window),
  });

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    model: String(row.model),
    answers: Number(row.answers ?? 0),
    tokensIn: Number(row.tokens_in ?? 0),
    tokensOut: Number(row.tokens_out ?? 0),
    costUsd: Number(row.cost_usd ?? 0),
  }));
}

export type TopSource = { documentId: string; title: string; citations: number };

export async function topSources(window: Window, limit = 8): Promise<TopSource[]> {
  const { data } = await requireAdminDb().rpc("assistant_top_sources", {
    p_since: since(window),
    p_limit: limit,
  });

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    documentId: String(row.document_id),
    title: String(row.title),
    citations: Number(row.citations ?? 0),
  }));
}

export type UnansweredQuestion = {
  question: string;
  askedAt: string;
  conversationId: string;
  channel: string;
};

export async function unansweredQuestions(
  window: Window,
  limit = 50,
): Promise<UnansweredQuestion[]> {
  const { data } = await requireAdminDb().rpc("assistant_unanswered", {
    p_since: since(window),
    p_limit: limit,
  });

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    question: String(row.question),
    askedAt: String(row.asked_at),
    conversationId: String(row.conversation_id),
    channel: String(row.channel),
  }));
}

// ── Formatting, shared by every screen that shows one of these ──────────────

export function percent(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(0)}%`;
}

/**
 * Costs run to fractions of a cent per answer, so two decimal places would
 * render a real month of traffic as "$0.00" and a real answer as free.
 */
export function money(value: number): string {
  if (value === 0) return "$0";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

export function count(value: number): string {
  return value.toLocaleString("en-US");
}
