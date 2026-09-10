import { requireAdminClient } from "@/lib/ai/admin-client";
import { getModelSettings, getSystemPrompt } from "@/lib/ai/config";
import { streamWithFallback, type StreamEvent } from "@/lib/ai/generate";
import { buildContextBlock, retrieve, toCitations } from "@/lib/ai/retrieve";
import { runTool, toolDefinitions } from "@/lib/ai/tools";
import type {
  ChatMessage,
  Channel,
  Citation,
  UsageAccounting,
} from "@/lib/ai/types";

/**
 * The brain.
 *
 * Every channel — the full-page chat, the widget, Telegram — calls `runTurn`
 * and nothing else. All conversation logic, retrieval and model access lives
 * here, so a new channel is a presentation layer and never a second
 * implementation of the same rules.
 *
 * A turn is: load history → retrieve context → stream an answer → run any tool
 * the model called → persist the exchange with its cost and sources.
 */

/** How many past messages stay verbatim before summarisation takes over. */
const WINDOW = 12;

/** Summarise once the conversation is meaningfully longer than the window. */
const SUMMARY_TRIGGER = 20;

export type TurnEvent =
  | { type: "text"; value: string }
  | { type: "citations"; value: Citation[] }
  | {
      type: "done";
      messageId: string;
      conversationId: string;
      handoff: boolean;
      leadCaptured: boolean;
    }
  | { type: "error"; message: string };

export async function ensureConversation(input: {
  conversationId?: string | null;
  channel: Channel;
  externalId: string;
}): Promise<string> {
  const supabase = requireAdminClient();

  if (input.conversationId) {
    const { data } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", input.conversationId)
      .maybeSingle();

    if (data) return data.id as string;
  }

  // upsert rather than insert: a returning visitor on the same channel keeps
  // one identity, which is what makes unified_users unified.
  const { data: user, error: userError } = await supabase
    .from("unified_users")
    .upsert(
      {
        channel: input.channel,
        external_id: input.externalId,
        last_seen: new Date().toISOString(),
      },
      { onConflict: "channel,external_id" },
    )
    .select("id")
    .single();

  if (userError) throw new Error(`Could not identify visitor: ${userError.message}`);

  const { data, error } = await supabase
    .from("conversations")
    .insert({ channel: input.channel, user_id: user.id })
    .select("id")
    .single();

  if (error) throw new Error(`Could not start conversation: ${error.message}`);

  return data.id as string;
}

async function loadHistory(
  conversationId: string,
): Promise<{ summary: string | null; messages: ChatMessage[]; total: number }> {
  const supabase = requireAdminClient();

  const [{ data: conversation }, { data: rows, count }] = await Promise.all([
    supabase.from("conversations").select("summary").eq("id", conversationId).maybeSingle(),
    supabase
      .from("messages")
      .select("role, content", { count: "exact" })
      .eq("conversation_id", conversationId)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: false })
      .limit(WINDOW),
  ]);

  return {
    summary: conversation?.summary ?? null,
    // Fetched newest-first so the limit takes the most recent turns, then
    // reversed because the model needs them in the order they happened.
    messages: (rows ?? []).reverse().map((row) => ({
      role: row.role as ChatMessage["role"],
      content: row.content as string,
    })),
    total: count ?? 0,
  };
}

/**
 * Compresses the turns that have fallen out of the window.
 *
 * Runs after the reply is already streamed, so it never delays an answer. A
 * failure here is logged and dropped: a stale summary costs some context, while
 * a thrown error would cost the visitor their reply.
 */
async function maybeSummarise(
  conversationId: string,
  channel: Channel,
  total: number,
): Promise<void> {
  if (total < SUMMARY_TRIGGER) return;

  try {
    const supabase = requireAdminClient();
    const settings = await getModelSettings(channel);

    const { data: rows } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: true })
      .limit(total - WINDOW);

    if (!rows?.length) return;

    const transcript = rows
      .map((row) => `${row.role === "user" ? "Visitor" : "Assistant"}: ${row.content}`)
      .join("\n");

    let summary = "";

    for await (const event of streamWithFallback(
      [
        {
          role: "system",
          content:
            "Summarise this conversation between a visitor and Arkan's assistant in under 150 words. " +
            "Keep what the visitor said about their business, what they asked, and anything they agreed to. " +
            "Write plainly. Do not add anything that was not said.",
        },
        { role: "user", content: transcript },
      ],
      { ...settings, maxTokens: 400 },
      [],
    )) {
      if (event.type === "text") summary += event.value;
    }

    if (summary.trim()) {
      await supabase
        .from("conversations")
        .update({ summary: summary.trim(), updated_at: new Date().toISOString() })
        .eq("id", conversationId);
    }
  } catch (error) {
    console.warn("[arkan] Conversation summarisation failed:", error);
  }
}

/**
 * One turn, streamed.
 *
 * Yields text as the model produces it, then citations, then a terminal event.
 * The caller decides how to put that on a wire — SSE for the web channels, a
 * single edited message for Telegram.
 */
export async function* runTurn(input: {
  conversationId: string;
  channel: Channel;
  question: string;
}): AsyncGenerator<TurnEvent> {
  const supabase = requireAdminClient();
  const startedAt = Date.now();

  const question = input.question.trim();

  if (!question) {
    yield { type: "error", message: "Ask a question to get started." };
    return;
  }

  try {
    const [settings, systemPrompt, history, chunks] = await Promise.all([
      getModelSettings(input.channel),
      getSystemPrompt(),
      loadHistory(input.conversationId),
      retrieve(question),
    ]);

    await supabase.from("messages").insert({
      conversation_id: input.conversationId,
      role: "user",
      content: question,
    });

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...(history.summary
        ? [
            {
              role: "system" as const,
              content: `# Earlier in this conversation\n\n${history.summary}`,
            },
          ]
        : []),
      { role: "system", content: buildContextBlock(chunks) },
      ...history.messages,
      { role: "user", content: question },
    ];

    let answer = "";
    let usage: UsageAccounting = {
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      modelUsed: settings.activeModel,
    };
    const toolEvents: Extract<StreamEvent, { type: "tool" }>[] = [];

    for await (const event of streamWithFallback(messages, settings, toolDefinitions)) {
      if (event.type === "text") {
        answer += event.value;
        yield { type: "text", value: event.value };
      } else if (event.type === "tool") {
        toolEvents.push(event);
      } else {
        usage = event.usage;
      }
    }

    let handoff = false;
    let leadCaptured = false;

    for (const call of toolEvents) {
      const outcome = await runTool(call.name, call.arguments, {
        conversationId: input.conversationId,
        channel: input.channel,
      });

      handoff = handoff || outcome.handoff;
      leadCaptured = leadCaptured || outcome.leadCaptured;

      // A tool call with no accompanying prose leaves the visitor staring at an
      // empty reply, so the tool's own result becomes the answer.
      if (!answer.trim()) {
        const followUp = await continueAfterTool(messages, answer, outcome.result, settings);
        answer = followUp;
        yield { type: "text", value: followUp };
      }
    }

    const citations = toCitations(chunks);
    yield { type: "citations", value: citations };

    const { data: saved } = await supabase
      .from("messages")
      .insert({
        conversation_id: input.conversationId,
        role: "assistant",
        content: answer,
        model_used: usage.modelUsed,
        tokens_in: usage.tokensIn,
        tokens_out: usage.tokensOut,
        cost_usd: usage.costUsd,
        retrieved_chunk_ids: chunks.map((chunk) => chunk.id),
        latency_ms: Date.now() - startedAt,
      })
      .select("id")
      .single();

    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", input.conversationId);

    yield {
      type: "done",
      messageId: (saved?.id as string) ?? "",
      conversationId: input.conversationId,
      handoff,
      leadCaptured,
    };

    await maybeSummarise(input.conversationId, input.channel, history.total + 2);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[arkan] Assistant turn failed:", message);

    await supabase.from("messages").insert({
      conversation_id: input.conversationId,
      role: "assistant",
      content: "",
      error: message.slice(0, 2000),
      latency_ms: Date.now() - startedAt,
    });

    yield {
      type: "error",
      message:
        "Something went wrong on our side. Please try again, or use the consultation form below.",
    };
  }
}

/** Asks the model to speak after a silent tool call. */
async function continueAfterTool(
  messages: ChatMessage[],
  partial: string,
  toolResult: string,
  settings: Awaited<ReturnType<typeof getModelSettings>>,
): Promise<string> {
  let text = "";

  for await (const event of streamWithFallback(
    [
      ...messages,
      { role: "assistant", content: partial || "(tool called)" },
      { role: "system", content: `Tool result: ${toolResult}` },
    ],
    settings,
    [],
  )) {
    if (event.type === "text") text += event.value;
  }

  return text.trim() || "Thank you — that is recorded.";
}
