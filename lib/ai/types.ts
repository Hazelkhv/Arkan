/**
 * The vocabulary the whole assistant shares.
 *
 * Everything here is channel-agnostic on purpose. A Telegram message, a widget
 * message and a full-page-chat message differ by one field — `channel` — and
 * nothing else, which is what lets one engine serve all three.
 */

export type Channel = "web" | "widget" | "telegram";

export const channels = ["web", "widget", "telegram"] as const;

export type MessageRole = "user" | "assistant" | "system" | "tool";

export type ConversationStatus =
  | "active"
  | "needs_human"
  | "human_active"
  | "closed";

/** A row of `chunks` joined to its document, as `match_chunks` returns it. */
export type RetrievedChunk = {
  id: string;
  documentId: string;
  content: string;
  similarity: number;
  chunkIndex: number;
  title: string;
  sourceUrl: string | null;
};

/**
 * What a visitor is shown as the source of an answer.
 *
 * One entry per document rather than per chunk: three chunks of the same page
 * are one source to a reader, however many times the retriever matched them.
 */
export type Citation = {
  documentId: string;
  title: string;
  sourceUrl: string | null;
  similarity: number;
};

export type TokenUsage = {
  tokensIn: number;
  tokensOut: number;
};

/**
 * One turn, as it happens.
 *
 * The engine yields these; a channel decides how to render them. Server-sent
 * events for the web channels, an edited Telegram message for Telegram. No
 * channel may add an event type of its own — anything a channel needs to say
 * about a turn is something the engine should be saying.
 */
export type TurnEvent =
  /** Sent once, first, so a new browser session can remember its conversation. */
  | { type: "conversation"; conversationId: string }
  /** Sources, sent before the first token so the UI can reserve their space. */
  | { type: "citations"; citations: Citation[] }
  | { type: "delta"; text: string }
  /** A tool started or finished. `label` is written for a visitor to read. */
  | { type: "tool"; name: string; state: "running" | "done"; label: string }
  /** The bot has stepped aside; an operator is now expected. */
  | { type: "handoff"; reason: string }
  | {
      type: "done";
      messageId: string;
      model: string;
      usage: TokenUsage;
      costUsd: number | null;
    }
  /** A visitor-facing sentence, never a stack trace. */
  | { type: "error"; message: string };

export type ModelSettings = {
  channel: Channel | null;
  provider: string;
  /** Null means "resolve from the live catalog"; see lib/ai/catalog.ts. */
  activeModel: string | null;
  fallbackModel: string | null;
  temperature: number;
  maxTokens: number;
  topP: number;
  schedule: ModelSchedule[];
  monthlyBudgetUsd: number | null;
};

/**
 * A model swap by day and time of day.
 *
 * `days` are ISO weekday numbers (1 = Monday). `from` and `to` are "HH:MM" in
 * the timezone named by `tz`, defaulting to Tehran — the office whose working
 * day these windows are written around.
 */
export type ModelSchedule = {
  days: number[];
  from: string;
  to: string;
  model: string;
  tz?: string;
};

export type EmbeddingProvider = "openai" | "cohere" | "google" | "voyage";

export type EmbeddingSettings = {
  provider: EmbeddingProvider;
  model: string;
  dimensions: number;
  chunkSize: number;
  chunkOverlap: number;
  chunkingStrategy: "recursive" | "paragraph" | "fixed";
  topK: number;
  similarityThreshold: number;
  rerankerEnabled: boolean;
  rerankerProvider: string | null;
  rerankerModel: string | null;
  rerankCandidates: number;
};

export type ChannelSettings = {
  channel: Channel;
  enabled: boolean;
  welcomeMessage: string | null;
  quickReplies: string[];
  appearance: Record<string, unknown>;
  allowedDomains: string[];
};

/** A message as the engine reads it back out of the database. */
export type StoredMessage = {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  /**
   * "operator" when a person wrote it during a takeover. The visitor sees a
   * different label on those, because a human reply wearing the assistant's
   * name would be a small lie told at the moment somebody asked for a person.
   */
  provider: string | null;
};

export type TurnRequest = {
  channel: Channel;
  /** Telegram chat id, or the browser's anonymous session id. */
  externalUserId: string;
  message: string;
  /** Absent on the first turn; the engine creates and returns one. */
  conversationId?: string;
};
