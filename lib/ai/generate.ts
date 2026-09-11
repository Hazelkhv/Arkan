import { OPENROUTER_BASE_URL } from "@/lib/ai/catalog";
import type { TokenUsage } from "@/lib/ai/types";

/**
 * Every call to a generation model, in one place.
 *
 * All models are reached through OpenRouter's OpenAI-compatible endpoint, so a
 * model change is a slug change: one string in model_config, never a key and
 * never a code path. Anthropic, Google, OpenAI and Qwen models all arrive here
 * looking identical.
 *
 * Three details of the wire format that are easy to get wrong, and each of
 * which breaks the stream rather than degrading it:
 *
 *   1. OpenRouter sends SSE comment lines (": OPENROUTER PROCESSING") to keep
 *      the connection alive. Handing one to JSON.parse throws.
 *   2. An error that happens after the response has been committed arrives as a
 *      chunk with an `error` field and HTTP 200, not as a failed request. Only
 *      checking response.ok would report a failed answer as a successful one.
 *   3. Streamed tool calls arrive in fragments — the name in one chunk and the
 *      arguments spread across many — keyed by `index`, and have to be
 *      reassembled before they can be parsed.
 */

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: ToolCall[];
    }
  | { role: "tool"; content: string; tool_call_id: string };

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ChatRequest = {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  signal?: AbortSignal;
};

export type ChatStreamEvent =
  | { type: "delta"; text: string }
  | { type: "tool_calls"; calls: ToolCall[] }
  | { type: "usage"; usage: TokenUsage }
  | { type: "finish"; reason: string };

function requireKey(): string {
  // `||`, not `??`: a blank value in .env must not shadow the check below.
  const key = process.env.OPENROUTER_API_KEY || "";

  if (!key) {
    throw new Error(
      "OPENROUTER_API_KEY is not set. Every generation model is reached " +
        "through OpenRouter, so the assistant cannot answer without it. " +
        "See .env.example.",
    );
  }

  return key;
}

function headers(): Record<string, string> {
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://arkan.co";

  return {
    "content-type": "application/json",
    authorization: `Bearer ${requireKey()}`,
    // OpenRouter attributes traffic with these and shows them on the
    // dashboard. Neither is required; both make the billing legible.
    "HTTP-Referer": site,
    "X-Title": "Arkan Assistant",
  };
}

function body(request: ChatRequest, stream: boolean): string {
  return JSON.stringify({
    model: request.model,
    messages: request.messages,
    stream,
    temperature: request.temperature,
    max_tokens: request.maxTokens,
    top_p: request.topP,
    ...(request.tools && request.tools.length > 0
      ? { tools: request.tools, tool_choice: "auto" }
      : {}),
  });
}

/**
 * Streams one model response.
 *
 * Yields deltas as they arrive, then any tool calls the model asked for, then
 * usage and the finish reason. The caller decides what a tool call means; this
 * function only knows how to read one off the wire.
 */
export async function* streamChat(
  request: ChatRequest,
): AsyncGenerator<ChatStreamEvent> {
  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: headers(),
    body: body(request, true),
    signal: request.signal,
  });

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `OpenRouter refused the request: ${response.status} ${response.statusText} ${detail.slice(0, 500)}`,
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let finishReason = "stop";
  let usage: TokenUsage | null = null;
  const toolCalls = new Map<number, ToolCall>();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line, but every provider streams
      // one JSON object per `data:` line, so splitting on newlines is both
      // sufficient and resilient to a frame arriving in two reads.
      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);

        if (line === "" || line.startsWith(":")) continue;
        if (!line.startsWith("data:")) continue;

        const payload = line.slice(5).trim();
        if (payload === "[DONE]") continue;

        let chunk: StreamChunk;
        try {
          chunk = JSON.parse(payload) as StreamChunk;
        } catch {
          // Only complete lines reach here — a newline was found — so this is
          // malformed rather than truncated. Skipping it costs at most one
          // fragment of text; putting it back would stall the loop forever.
          console.error("[arkan] Unparseable stream chunk, skipped:", payload.slice(0, 200));
          continue;
        }

        if (chunk.error) {
          throw new Error(
            `The model returned an error mid-stream: ${chunk.error.message ?? "unknown"}`,
          );
        }

        if (chunk.usage) {
          usage = {
            tokensIn: chunk.usage.prompt_tokens ?? 0,
            tokensOut: chunk.usage.completion_tokens ?? 0,
          };
        }

        const choice = chunk.choices?.[0];
        if (!choice) continue;

        if (choice.finish_reason) finishReason = choice.finish_reason;

        const text = choice.delta?.content;
        if (typeof text === "string" && text !== "") {
          yield { type: "delta", text };
        }

        for (const fragment of choice.delta?.tool_calls ?? []) {
          const index = fragment.index ?? 0;
          const existing = toolCalls.get(index) ?? {
            id: "",
            type: "function" as const,
            function: { name: "", arguments: "" },
          };

          toolCalls.set(index, {
            id: fragment.id || existing.id,
            type: "function",
            function: {
              name: fragment.function?.name || existing.function.name,
              arguments:
                existing.function.arguments + (fragment.function?.arguments ?? ""),
            },
          });
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (toolCalls.size > 0) {
    yield { type: "tool_calls", calls: [...toolCalls.values()] };
  }

  if (usage) yield { type: "usage", usage };
  yield { type: "finish", reason: finishReason };
}

type StreamChunk = {
  error?: { message?: string };
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  choices?: {
    finish_reason?: string | null;
    delta?: {
      content?: string | null;
      tool_calls?: {
        index?: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }[];
    };
  }[];
};

/**
 * One non-streamed completion.
 *
 * Used for the work nobody is watching — summarising a long conversation,
 * naming a thread — where streaming would add complexity and buy nothing.
 */
export async function completeChat(
  request: ChatRequest,
): Promise<{ text: string; usage: TokenUsage | null }> {
  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: headers(),
    body: body(request, false),
    signal: request.signal ?? AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `OpenRouter refused the request: ${response.status} ${response.statusText} ${detail.slice(0, 500)}`,
    );
  }

  const parsed = (await response.json()) as {
    error?: { message?: string };
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  if (parsed.error) {
    throw new Error(`The model returned an error: ${parsed.error.message}`);
  }

  return {
    text: parsed.choices?.[0]?.message?.content ?? "",
    usage: parsed.usage
      ? {
          tokensIn: parsed.usage.prompt_tokens ?? 0,
          tokensOut: parsed.usage.completion_tokens ?? 0,
        }
      : null,
  };
}
