import type { Channel } from "@/lib/ai/types";

/**
 * The words the panel uses for values the database stores as slugs.
 *
 * Here rather than inline so "web" reads as "Full-page chat" on every screen
 * that mentions it. An operator should never have to learn that the channel
 * they know as the widget is called `widget` in one table and something else on
 * another page.
 */

export function channelLabel(channel: string): string {
  if (channel === "web") return "Full-page chat";
  if (channel === "widget") return "Widget";
  if (channel === "telegram") return "Telegram";
  return channel;
}

export const CHANNEL_OPTIONS: { value: Channel; label: string }[] = [
  { value: "web", label: "Full-page chat" },
  { value: "widget", label: "Widget" },
  { value: "telegram", label: "Telegram" },
];

export function statusLabel(status: string): string {
  if (status === "active") return "Active";
  if (status === "needs_human") return "Needs a person";
  if (status === "human_active") return "Operator replying";
  if (status === "closed") return "Closed";
  return status;
}

export function documentStatusLabel(status: string): string {
  if (status === "pending") return "Queued";
  if (status === "processing") return "Indexing";
  if (status === "ready") return "Ready";
  if (status === "failed") return "Failed";
  return status;
}

export function when(value: string | null | undefined): string {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  // Fixed locale and 24-hour clock: the panel is used from one office, and a
  // timestamp that renders differently for two operators is one they cannot
  // quote to each other.
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
