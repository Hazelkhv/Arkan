/**
 * Shared vocabulary for the assistant.
 *
 * These types are the contract between the brain and its channels. A channel
 * may only speak in terms of what is here — that is what keeps Telegram, the
 * widget and the full-page chat from growing their own dialects of the same
 * conversation.
 */

export const CHANNELS = ["web", "widget", "telegram"] as const;
export type Channel = (typeof CHANNELS)[number];

export type MessageRole = "user" | "assistant" | "system" | "tool";

export type ChatMessage = {
  role: MessageRole;
  content: string;
};

/** A chunk that came back from retrieval, with enough to cite it. */
export type RetrievedChunk = {
  id: string;
  documentId: string;
  content: string;
  similarity: number;
  chunkIndex: number;
  title: string;
  sourceUrl: string | null;
};

/** What the UI shows under an answer. One entry per source document, not per chunk. */
export type Citation = {
  documentId: string;
  title: string;
  sourceUrl: string | null;
  /** Best similarity among the chunks retrieved from this document. */
  similarity: number;
};

export type ModelSettings = {
  provider: string;
  activeModel: string;
  fallbackModel: string | null;
  temperature: number;
  maxTokens: number;
  topP: number;
  monthlyBudgetUsd: number | null;
};

export type EmbeddingSettings = {
  provider: "google" | "openai" | "cohere" | "voyage";
  model: string;
  dimensions: number;
  chunkSize: number;
  chunkOverlap: number;
  topK: number;
  similarityThreshold: number;
  rerankerEnabled: boolean;
  rerankerModel: string | null;
};

/**
 * Embeddings are directional: the same text embeds differently depending on
 * whether it is being stored or searched for. Every provider expresses this,
 * but each with its own spelling, so the engine speaks in these two words and
 * each provider adapter translates.
 */
export type EmbeddingPurpose = "document" | "query";

export type EmbeddingInput = {
  text: string;
  /** Only used for documents, where a title improves the embedding. */
  title?: string;
};

/** What the engine hands back to a channel for one turn. */
export type TurnResult = {
  conversationId: string;
  messageId: string;
  text: string;
  citations: Citation[];
  modelUsed: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  latencyMs: number;
  /** Set when the model decided the visitor should reach a person. */
  handoff: boolean;
  /** Set when the model captured a lead this turn. */
  leadCaptured: boolean;
};

export type UsageAccounting = {
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  modelUsed: string;
};
