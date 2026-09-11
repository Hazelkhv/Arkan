import { requireAdminDb } from "@/lib/ai/admin-client";
import { completeChat } from "@/lib/ai/generate";
import type {
  Channel,
  ConversationStatus,
  StoredMessage,
  TokenUsage,
} from "@/lib/ai/types";

/**
 * Conversation state: who is talking, what has been said, and what the model
 * is allowed to see of it.
 *
 * A conversation id arrives from the browser, and a browser is not trusted, so
 * every lookup here is bound to the channel and the external user id as well.
 * Without that, changing one uuid in a request body would replay somebody
 * else's conversation — including the contact details they gave the lead tool.
 */

/** Turns kept verbatim at the end of the window. */
const KEEP_VERBATIM = 8;

/** Unsummarised turns tolerated before the older ones are folded into prose. */
const SUMMARISE_AFTER = 20;

export type Conversation = {
  id: string;
  channel: Channel;
  userId: string | null;
  status: ConversationStatus;
  summary: string | null;
  summarizedThrough: number;
  messageCount: number;
};

export async function ensureUser(
  channel: Channel,
  externalId: string,
): Promise<string | null> {
  const db = requireAdminDb();

  const { data, error } = await db
    .from("unified_users")
    .upsert(
      { channel, external_id: externalId, last_seen: new Date().toISOString() },
      { onConflict: "channel,external_id" },
    )
    .select("id")
    .maybeSingle();

  if (error) {
    // A missing user row costs analytics, not the answer, so this is logged
    // rather than thrown.
    console.error("[arkan] Could not record the visitor:", error.message);
    return null;
  }

  return (data as { id?: string } | null)?.id ?? null;
}

/**
 * The conversation this turn belongs to, creating one if needed.
 *
 * An id that does not belong to this visitor is treated as no id at all: a new
 * conversation starts, rather than an error that would tell the caller their
 * guess was close.
 */
export async function ensureConversation(input: {
  channel: Channel;
  externalUserId: string;
  conversationId?: string;
}): Promise<Conversation> {
  const db = requireAdminDb();
  const userId = await ensureUser(input.channel, input.externalUserId);

  if (input.conversationId) {
    const { data } = await db
      .from("conversations")
      .select(
        "id, channel, user_id, status, summary, summarized_through, message_count",
      )
      .eq("id", input.conversationId)
      .eq("channel", input.channel)
      .maybeSingle();

    const row = data as Record<string, unknown> | null;

    // Ownership has to be provable, not merely un-disproved. If the visitor
    // could not be identified at all, a new conversation is the safe answer:
    // the cost is a lost thread, and the alternative is handing someone else's
    // transcript to whoever guessed the id.
    if (row && userId && row.user_id === userId) {
      return toConversation(row);
    }
  }

  const { data, error } = await db
    .from("conversations")
    .insert({ channel: input.channel, user_id: userId })
    .select(
      "id, channel, user_id, status, summary, summarized_through, message_count",
    )
    .maybeSingle();

  if (error || !data) {
    throw new Error(
      `Could not start a conversation: ${error?.message ?? "no row returned"}`,
    );
  }

  return toConversation(data as Record<string, unknown>);
}

function toConversation(row: Record<string, unknown>): Conversation {
  return {
    id: row.id as string,
    channel: row.channel as Channel,
    userId: (row.user_id as string | null) ?? null,
    status: (row.status as ConversationStatus) ?? "active",
    summary: (row.summary as string | null) ?? null,
    summarizedThrough: Number(row.summarized_through ?? 0),
    messageCount: Number(row.message_count ?? 0),
  };
}

export async function loadMessages(
  conversationId: string,
  options: { limit?: number; offset?: number } = {},
): Promise<StoredMessage[]> {
  const db = requireAdminDb();

  const query = db
    .from("messages")
    .select("id, role, content, created_at, provider")
    .eq("conversation_id", conversationId)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  const { data, error } = await (options.limit
    ? query.range(options.offset ?? 0, (options.offset ?? 0) + options.limit - 1)
    : query);

  if (error) throw new Error(`Reading the conversation failed: ${error.message}`);

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    role: row.role as StoredMessage["role"],
    content: row.content as string,
    createdAt: row.created_at as string,
    provider: (row.provider as string | null) ?? null,
  }));
}

export type RecordedMessage = {
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  modelUsed?: string | null;
  provider?: string | null;
  usage?: TokenUsage | null;
  costUsd?: number | null;
  retrievedChunkIds?: string[];
  topSimilarity?: number | null;
  toolCalls?: unknown;
  finishReason?: string | null;
  latencyMs?: number | null;
  error?: string | null;
};

export async function recordMessage(
  message: RecordedMessage,
): Promise<string | null> {
  const db = requireAdminDb();

  const { data, error } = await db
    .from("messages")
    .insert({
      conversation_id: message.conversationId,
      role: message.role,
      content: message.content,
      model_used: message.modelUsed ?? null,
      provider: message.provider ?? null,
      tokens_in: message.usage?.tokensIn ?? null,
      tokens_out: message.usage?.tokensOut ?? null,
      cost_usd: message.costUsd ?? null,
      retrieved_chunk_ids: message.retrievedChunkIds ?? [],
      top_similarity: message.topSimilarity ?? null,
      tool_calls: message.toolCalls ?? null,
      finish_reason: message.finishReason ?? null,
      latency_ms: message.latencyMs ?? null,
      error: message.error ?? null,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[arkan] Could not store a message:", error.message);
    return null;
  }

  return (data as { id?: string } | null)?.id ?? null;
}

/**
 * Keeps the conversation row in step with its messages.
 *
 * message_count is denormalised because the inbox lists hundreds of
 * conversations at a time and a count(*) per row is the query that makes that
 * page slow.
 */
export async function touchConversation(
  conversationId: string,
  added: number,
): Promise<void> {
  const db = requireAdminDb();

  // An RPC rather than a read-modify-write: two channels can be appending to
  // the same conversation, and a count that loses an increment is a count
  // nobody can trust afterwards.
  const { error } = await db.rpc("bump_conversation", {
    p_conversation: conversationId,
    p_added: added,
  });

  if (error) {
    console.error("[arkan] Could not update the conversation counter:", error.message);
  }
}

/**
 * The window the model is given: a summary of everything older, then the last
 * few turns verbatim.
 *
 * Summarising is what keeps a long conversation inside the context limit
 * without the model losing the thread — the visitor's business, what they have
 * already been told, and what they have already been asked for.
 */
export async function buildWindow(
  conversation: Conversation,
): Promise<{ summary: string | null; recent: StoredMessage[] }> {
  const all = await loadMessages(conversation.id);
  const recent = all.slice(Math.max(0, all.length - KEEP_VERBATIM));

  return { summary: conversation.summary, recent };
}

/**
 * Folds the older half of a long conversation into prose.
 *
 * Runs after a turn rather than before it, so a visitor never waits on it, and
 * a failure is swallowed: an un-summarised conversation still answers, it just
 * carries more tokens.
 */
export async function maybeSummarise(
  conversation: Conversation,
  model: string,
): Promise<void> {
  try {
    const all = await loadMessages(conversation.id);
    const unsummarised = all.length - conversation.summarizedThrough;

    if (unsummarised <= SUMMARISE_AFTER) return;

    const upTo = all.length - KEEP_VERBATIM;
    const fold = all.slice(conversation.summarizedThrough, upTo);
    if (fold.length === 0) return;

    const transcript = fold
      .map((message) => `${message.role === "user" ? "Visitor" : "Assistant"}: ${message.content}`)
      .join("\n");

    const { text } = await completeChat({
      model,
      temperature: 0,
      maxTokens: 400,
      messages: [
        {
          role: "system",
          content:
            "Summarise this part of a conversation between a visitor and a " +
            "business advisory's assistant. Keep every fact about the " +
            "visitor's business, what they asked for, what they were told, " +
            "and any contact details they gave. Third person, under 200 " +
            "words, no preamble.",
        },
        {
          role: "user",
          content: conversation.summary
            ? `Summary so far:\n${conversation.summary}\n\nNew turns:\n${transcript}`
            : transcript,
        },
      ],
    });

    if (!text.trim()) return;

    const db = requireAdminDb();
    await db
      .from("conversations")
      .update({ summary: text.trim(), summarized_through: upTo })
      .eq("id", conversation.id);
  } catch (error) {
    console.error("[arkan] Summarising a conversation failed:", error);
  }
}

/**
 * The conversation a returning visitor is already in.
 *
 * The web channels remember their conversation id in the browser. Telegram has
 * nowhere to put one — an update carries a chat id and nothing else — so the
 * thread has to be found again on every message. The most recent conversation
 * that is still open is it.
 */
export async function latestConversationId(
  channel: Channel,
  externalId: string,
): Promise<string | undefined> {
  const db = requireAdminDb();

  const { data: user } = await db
    .from("unified_users")
    .select("id")
    .eq("channel", channel)
    .eq("external_id", externalId)
    .maybeSingle();

  const userId = (user as { id?: string } | null)?.id;
  if (!userId) return undefined;

  const { data } = await db
    .from("conversations")
    .select("id")
    .eq("user_id", userId)
    .eq("channel", channel)
    .neq("status", "closed")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as { id?: string } | null)?.id;
}

/**
 * Ends every open conversation for a visitor, which is what /reset means.
 *
 * Closed rather than deleted: the operator's inbox keeps the transcript, and
 * the visitor gets a clean thread. Nobody's history disappears because somebody
 * wanted to start again.
 */
export async function closeConversations(
  channel: Channel,
  externalId: string,
): Promise<void> {
  const db = requireAdminDb();

  const { data: user } = await db
    .from("unified_users")
    .select("id")
    .eq("channel", channel)
    .eq("external_id", externalId)
    .maybeSingle();

  const userId = (user as { id?: string } | null)?.id;
  if (!userId) return;

  await db
    .from("conversations")
    .update({ status: "closed", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("channel", channel)
    .neq("status", "closed");
}

export async function setConversationStatus(
  conversationId: string,
  status: ConversationStatus,
): Promise<void> {
  const db = requireAdminDb();

  await db
    .from("conversations")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", conversationId);
}
