import type { ChatMessage, ModelSettings, UsageAccounting } from "@/lib/ai/types";

/**
 * Generation, through OpenRouter.
 *
 * One key and one base URL reach every provider, using the OpenAI-compatible
 * request shape. Switching from Gemini to Claude to GPT is a change to one
 * string in model_config — never a key change, never a code change. That is why
 * nothing below branches on which model is in use.
 *
 * Model slugs are namespaced (`google/…`, `anthropic/…`) and are never written
 * from memory: the admin picker is populated from the live catalog, see
 * fetchCatalog.
 */

const BASE_URL = "https://openrouter.ai/api/v1";

export type StreamEvent =
  | { type: "text"; value: string }
  | { type: "tool"; name: string; arguments: string }
  | { type: "done"; usage: UsageAccounting };

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

function requireKey(): string {
  const key = process.env.OPENROUTER_API_KEY;

  if (!key) {
    throw new Error(
      "OPENROUTER_API_KEY is not set. Every generation model is reached through OpenRouter.",
    );
  }

  return key;
}

/**
 * The live model catalog.
 *
 * The admin picker is built from this rather than a hardcoded list, so models
 * added or retired by a provider appear and disappear on their own. Public
 * endpoint — no key needed to read it.
 */
export async function fetchCatalog(): Promise<
  {
    id: string;
    name: string;
    provider: string;
    contextLength: number;
    promptUsd: number;
    completionUsd: number;
  }[]
> {
  const response = await fetch(`${BASE_URL}/models`, {
    // Models change rarely; an hour of staleness is a fair trade for not
    // hitting the catalog on every admin page load.
    next: { revalidate: 3600 },
  });

  if (!response.ok) {
    throw new Error(`Could not read the OpenRouter catalog (${response.status}).`);
  }

  const payload = (await response.json()) as {
    data: {
      id: string;
      name: string;
      context_length: number;
      pricing: { prompt: string; completion: string };
    }[];
  };

  return payload.data
    .map((model) => ({
      id: model.id,
      name: model.name,
      provider: model.id.split("/")[0] ?? "other",
      contextLength: model.context_length,
      promptUsd: Number(model.pricing.prompt) * 1_000_000,
      completionUsd: Number(model.pricing.completion) * 1_000_000,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

type StreamChoice = {
  delta?: {
    content?: string | null;
    tool_calls?: {
      index: number;
      function?: { name?: string; arguments?: string };
    }[];
  };
};

/**
 * Streams one completion.
 *
 * Yields text as it arrives, then any tool call the model made, then a final
 * usage event. Usage is reported by OpenRouter in the last chunk when
 * `include_usage` is set — asking for it is what makes per-message cost
 * accounting possible without a second round trip.
 */
export async function* streamCompletion(
  messages: ChatMessage[],
  settings: ModelSettings,
  tools: ToolDefinition[],
  model = settings.activeModel,
): AsyncGenerator<StreamEvent> {
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireKey()}`,
      "Content-Type": "application/json",
      // OpenRouter uses these for its dashboard attribution. Harmless, and it
      // makes spend traceable to this app when a key is shared.
      "HTTP-Referer": process.env.SITE_URL ?? "https://arkan.co",
      "X-Title": "Arkan Assistant",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: settings.temperature,
      max_tokens: settings.maxTokens,
      top_p: settings.topP,
      stream: true,
      stream_options: { include_usage: true },
      ...(tools.length ? { tools } : {}),
    }),
  });

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `OpenRouter refused the request (${response.status}): ${detail.slice(0, 400)}`,
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let usage: UsageAccounting = {
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
    modelUsed: model,
  };

  // Tool call arguments arrive in fragments across many chunks and have to be
  // reassembled by index before they can be parsed.
  const toolCalls = new Map<number, { name: string; arguments: string }>();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line; a partial frame stays in the
    // buffer until the rest of it arrives.
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;

      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;

      let parsed: {
        choices?: StreamChoice[];
        usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
        model?: string;
      };

      try {
        parsed = JSON.parse(data);
      } catch {
        continue; // A keep-alive comment or a truncated frame.
      }

      if (parsed.usage) {
        usage = {
          tokensIn: parsed.usage.prompt_tokens ?? 0,
          tokensOut: parsed.usage.completion_tokens ?? 0,
          costUsd: parsed.usage.cost ?? 0,
          modelUsed: parsed.model ?? model,
        };
      }

      const delta = parsed.choices?.[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        yield { type: "text", value: delta.content };
      }

      for (const call of delta.tool_calls ?? []) {
        const existing = toolCalls.get(call.index) ?? { name: "", arguments: "" };

        toolCalls.set(call.index, {
          name: call.function?.name || existing.name,
          arguments: existing.arguments + (call.function?.arguments ?? ""),
        });
      }
    }
  }

  for (const call of toolCalls.values()) {
    if (call.name) {
      yield { type: "tool", name: call.name, arguments: call.arguments };
    }
  }

  yield { type: "done", usage };
}

/**
 * Streams with the fallback model if the primary fails.
 *
 * A rate limit or a provider outage should degrade the answer's model, not the
 * visitor's experience. The fallback is only attempted before any text has been
 * emitted — once the visitor is reading a reply, switching models mid-sentence
 * would produce a visibly incoherent answer.
 */
export async function* streamWithFallback(
  messages: ChatMessage[],
  settings: ModelSettings,
  tools: ToolDefinition[],
): AsyncGenerator<StreamEvent> {
  try {
    yield* streamCompletion(messages, settings, tools);
    return;
  } catch (error) {
    if (!settings.fallbackModel) throw error;

    console.warn(
      `[arkan] ${settings.activeModel} failed, falling back to ${settings.fallbackModel}:`,
      error instanceof Error ? error.message : error,
    );
  }

  yield* streamCompletion(messages, settings, tools, settings.fallbackModel);
}
