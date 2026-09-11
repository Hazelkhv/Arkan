import { cheapestUsableModel, monthToDateSpend } from "@/lib/ai/budget";
import { costOf, findModel, getCatalog, selectModel } from "@/lib/ai/catalog";
import {
  getActivePrompt,
  getEmbeddingSettings,
  getModelSettings,
} from "@/lib/ai/config";
import {
  streamChat,
  type ChatMessage,
  type ToolCall,
} from "@/lib/ai/generate";
import {
  buildWindow,
  ensureConversation,
  maybeSummarise,
  recordMessage,
  touchConversation,
} from "@/lib/ai/memory";
import { checkRateLimit } from "@/lib/ai/rate-limit";
import { formatContext, retrieve, EMPTY_RETRIEVAL } from "@/lib/ai/retrieve";
import { runTool, toolDefinitions, type ToolResult } from "@/lib/ai/tools";
import type { TokenUsage, TurnEvent, TurnRequest } from "@/lib/ai/types";

/**
 * One brain, many channels.
 *
 * This is the whole of what the assistant does. Retrieval, history, the
 * persona, tool calls, guardrails, cost accounting and the handoff all happen
 * here, once. A channel — the full-page chat, the widget, Telegram — is a
 * transport: it turns a request into a TurnRequest, renders the events this
 * yields, and knows nothing else.
 *
 * That separation is the point of the architecture rather than a tidiness
 * preference. The moment a channel decides for itself what to retrieve or when
 * to offer a consultation, there are two assistants with two sets of rules, and
 * only one of them gets updated when the rules change.
 */

/** The visitor sees this when something breaks. It is never a stack trace. */
const FAILURE_MESSAGE =
  "Something went wrong at our end. Please try again, or email nazanin.khosravi20.nk@gmail.com and the team will pick it up.";

const TOO_FAST_MESSAGE =
  "That is a lot of questions at once. Give it a moment and send that again.";

const PAUSED_MESSAGE =
  "A colleague from the Arkan team is replying to this conversation. Your message has been passed to them.";

/** A visitor message longer than this is a paste, not a question. */
const MAX_MESSAGE_CHARS = 4000;

/** How many rounds of tool calls one turn may take before it must answer. */
const MAX_TOOL_ROUNDS = 3;

export async function* runTurn(
  request: TurnRequest,
): AsyncGenerator<TurnEvent> {
  const question = request.message.trim().slice(0, MAX_MESSAGE_CHARS);

  if (!question) {
    yield { type: "error", message: "Ask me something and I will help if I can." };
    return;
  }

  const limit = await checkRateLimit(`chat:${request.channel}`, request.externalUserId);

  if (!limit.allowed) {
    yield { type: "error", message: TOO_FAST_MESSAGE };
    return;
  }

  let conversationId: string | null = null;

  try {
    const conversation = await ensureConversation(request);
    conversationId = conversation.id;

    yield { type: "conversation", conversationId: conversation.id };

    await recordMessage({
      conversationId: conversation.id,
      role: "user",
      content: question,
    });

    // An operator has taken this conversation over. Their message is stored so
    // it appears in the inbox, and the bot stays out of the way rather than
    // talking over the person now handling it.
    if (conversation.status === "human_active") {
      // The acknowledgement is stored as well as sent. A visitor who reloads
      // should still see why the assistant went quiet, and the operator should
      // see in the transcript exactly what their visitor was told.
      const messageId = await recordMessage({
        conversationId: conversation.id,
        role: "assistant",
        content: PAUSED_MESSAGE,
      });

      await touchConversation(conversation.id, 2);

      yield { type: "delta", text: PAUSED_MESSAGE };
      yield { type: "handoff", reason: "An operator is answering this conversation." };
      yield {
        type: "done",
        messageId: messageId ?? "",
        model: "",
        usage: { tokensIn: 0, tokensOut: 0 },
        costUsd: null,
      };
      return;
    }

    const startedAt = Date.now();

    const [modelSettings, embeddingSettings, prompt, catalog] = await Promise.all([
      getModelSettings(request.channel),
      getEmbeddingSettings(),
      getActivePrompt(),
      getCatalog(),
    ]);

    // Retrieval failing is not the same as retrieval finding nothing, but both
    // end the same way for the visitor: the assistant says it does not have
    // that detail rather than inventing it.
    const retrieval = await retrieve(question, embeddingSettings).catch((error) => {
      console.error("[arkan] Retrieval failed:", error);
      return EMPTY_RETRIEVAL;
    });

    if (retrieval.citations.length > 0) {
      yield { type: "citations", citations: retrieval.citations };
    }

    const window = await buildWindow(conversation);

    const messages: ChatMessage[] = [
      { role: "system", content: prompt.content },
      { role: "system", content: contextBlock(retrieval.chunks.length, formatContext(retrieval.chunks)) },
      ...(window.summary
        ? [
            {
              role: "system" as const,
              content: `Earlier in this conversation:\n${window.summary}`,
            },
          ]
        : []),
      ...window.recent.map((message) =>
        message.role === "user"
          ? ({ role: "user", content: message.content } as ChatMessage)
          : ({ role: "assistant", content: message.content } as ChatMessage),
      ),
      { role: "user", content: question },
    ];

    const chosen = await chooseModel(modelSettings, catalog);

    if (!chosen) {
      yield { type: "error", message: FAILURE_MESSAGE };
      return;
    }

    let answer = "";
    let usage: TokenUsage = { tokensIn: 0, tokensOut: 0 };
    let finishReason = "stop";
    let handoffReason: string | null = null;
    const toolCallsMade: ToolCall[] = [];

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
      const lastRound = round === MAX_TOOL_ROUNDS;

      const stream = streamWithFallback({
        model: chosen.slug,
        fallback: modelSettings.fallbackModel,
        messages,
        // On the final round the tools are withheld, which is what forces the
        // model to produce an answer instead of asking for another call.
        tools: lastRound ? undefined : toolDefinitions,
        temperature: modelSettings.temperature,
        maxTokens: modelSettings.maxTokens,
        topP: modelSettings.topP,
        hasEmitted: () => answer.length > 0,
      });

      let calls: ToolCall[] = [];

      for await (const event of stream) {
        if (event.type === "delta") {
          answer += event.text;
          yield { type: "delta", text: event.text };
        } else if (event.type === "tool_calls") {
          calls = event.calls;
        } else if (event.type === "usage") {
          usage = {
            tokensIn: usage.tokensIn + event.usage.tokensIn,
            tokensOut: usage.tokensOut + event.usage.tokensOut,
          };
        } else if (event.type === "finish") {
          finishReason = event.reason;
        }
      }

      if (calls.length === 0) break;

      toolCallsMade.push(...calls);

      messages.push({
        role: "assistant",
        content: answer || null,
        tool_calls: calls,
      });

      for (const call of calls) {
        yield {
          type: "tool",
          name: call.function.name,
          state: "running",
          label: runningLabel(call.function.name),
        };

        let result: ToolResult;

        try {
          result = await runTool(call, {
            conversationId: conversation.id,
            channel: request.channel,
          });
        } catch (error) {
          console.error(`[arkan] Tool ${call.function.name} threw:`, error);
          result = {
            content:
              "That action failed. Apologise briefly and give the visitor " +
              "nazanin.khosravi20.nk@gmail.com so they can reach the team directly.",
            label: "Action failed",
          };
        }

        if (result.handoffReason) handoffReason = result.handoffReason;

        yield {
          type: "tool",
          name: call.function.name,
          state: "done",
          label: result.label,
        };

        messages.push({
          role: "tool",
          content: result.content,
          tool_call_id: call.id,
        });
      }
    }

    if (handoffReason) {
      yield { type: "handoff", reason: handoffReason };
    }

    const model = findModel(catalog, chosen.slug);

    const messageId = await recordMessage({
      conversationId: conversation.id,
      role: "assistant",
      content: answer,
      modelUsed: chosen.slug,
      provider: modelSettings.provider,
      usage,
      costUsd: costOf(model, usage.tokensIn, usage.tokensOut),
      retrievedChunkIds: retrieval.chunks.map((chunk) => chunk.id),
      topSimilarity: retrieval.topSimilarity,
      toolCalls: toolCallsMade.length > 0 ? toolCallsMade : null,
      finishReason,
      latencyMs: Date.now() - startedAt,
    });

    await touchConversation(conversation.id, 2);

    yield {
      type: "done",
      messageId: messageId ?? "",
      model: chosen.slug,
      usage,
      costUsd: costOf(model, usage.tokensIn, usage.tokensOut),
    };

    // After the answer, never before it: the visitor has what they asked for
    // and this only runs on conversations long enough to need it.
    await maybeSummarise(conversation, chosen.slug);
  } catch (error) {
    console.error("[arkan] The turn failed:", error);

    if (conversationId) {
      await recordMessage({
        conversationId,
        role: "assistant",
        content: "",
        error: error instanceof Error ? error.message : String(error),
      });
    }

    yield { type: "error", message: FAILURE_MESSAGE };
  }
}

/**
 * The retrieved passages, wrapped in the instruction that makes them binding.
 *
 * The empty case carries its own instruction rather than an empty block. "No
 * passages matched" has to be stated, because a model handed an empty context
 * section will answer from its own memory of the world and sound just as
 * certain doing it.
 */
function contextBlock(count: number, context: string): string {
  if (count === 0) {
    return (
      "# Retrieved context\n\nNothing in the knowledge base matched this " +
      "question.\n\nSay plainly that you do not have that detail. Do not " +
      "answer it from general knowledge and do not guess. Offer the initial " +
      "conversation with the team, or a colleague, as the way to get a real " +
      "answer. You may still use what this conversation has already " +
      "established."
    );
  }

  return (
    "# Retrieved context\n\nAnswer from these passages. Where a passage does " +
    "not cover something, say so rather than filling the gap.\n\n" +
    context
  );
}

function runningLabel(name: string): string {
  switch (name) {
    case "capture_lead":
      return "Sending your request…";
    case "request_human":
      return "Passing this to the team…";
    default:
      return "Working…";
  }
}

/**
 * Which model this turn runs on.
 *
 * A schedule window beats the pinned model, the pinned model beats the live
 * catalog's choice — and the spend cap beats all three, downgrading rather than
 * refusing. See lib/ai/budget.ts for why a cap that blacks out the assistant
 * would be the wrong trade for this site.
 */
async function chooseModel(
  settings: Parameters<typeof selectModel>[0],
  catalog: Awaited<ReturnType<typeof getCatalog>>,
): Promise<{ slug: string; source: string } | null> {
  const chosen = selectModel(settings, catalog);
  if (!chosen) return null;

  if (settings.monthlyBudgetUsd === null) return chosen;

  const spent = await monthToDateSpend();
  if (spent < settings.monthlyBudgetUsd) return chosen;

  const cheapest = cheapestUsableModel(catalog);

  if (!cheapest || cheapest.id === chosen.slug) return chosen;

  console.warn(
    `[arkan] Monthly spend $${spent.toFixed(2)} has passed the $${settings.monthlyBudgetUsd} cap. ` +
      `Answering on ${cheapest.id} instead of ${chosen.slug} until the month rolls over.`,
  );

  return { slug: cheapest.id, source: "budget" };
}

/**
 * The primary model, or the fallback if the primary never got started.
 *
 * The fallback only covers a failure before the first token. Once text has
 * reached the visitor, re-running the turn on another model would repeat or
 * contradict what they have already read, so a mid-stream failure is surfaced
 * as an error instead.
 */
async function* streamWithFallback(options: {
  model: string;
  fallback: string | null;
  messages: ChatMessage[];
  tools?: typeof toolDefinitions;
  temperature: number;
  maxTokens: number;
  topP: number;
  hasEmitted: () => boolean;
}) {
  const attempt = (model: string) =>
    streamChat({
      model,
      messages: options.messages,
      tools: options.tools,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      topP: options.topP,
    });

  let emittedHere = false;

  try {
    for await (const event of attempt(options.model)) {
      if (event.type === "delta") emittedHere = true;
      yield event;
    }
    return;
  } catch (error) {
    if (emittedHere || options.hasEmitted() || !options.fallback) throw error;

    console.error(
      `[arkan] ${options.model} failed before answering; falling back to ${options.fallback}:`,
      error,
    );
  }

  yield* attempt(options.fallback!);
}
