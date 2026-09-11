import type { Channel, TurnEvent } from "@/lib/ai/types";

/**
 * The browser half of the chat transport.
 *
 * Type-only imports from lib/ai — types are erased at build time, so nothing
 * from the engine, and none of its secrets, can follow them into the bundle.
 *
 * EventSource is not used, and cannot be: it only issues GET requests, and a
 * question belongs in a body rather than a URL that ends up in server logs and
 * browser history. So this reads the response body of a POST and parses the
 * same server-sent event framing by hand.
 */

export type ChatStreamOptions = {
  message: string;
  conversationId?: string;
  channel?: Channel;
  /** Widget only: the id kept in the host page's localStorage. */
  sessionId?: string;
  endpoint?: string;
  signal?: AbortSignal;
  onEvent: (event: TurnEvent) => void;
};

export async function streamTurn(options: ChatStreamOptions): Promise<void> {
  const response = await fetch(options.endpoint ?? "/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    // The cookie is what identifies a first-party visitor, and it is httpOnly,
    // so the request has to be allowed to carry credentials.
    credentials: "include",
    body: JSON.stringify({
      message: options.message,
      conversationId: options.conversationId,
      channel: options.channel ?? "web",
      sessionId: options.sessionId,
    }),
    signal: options.signal,
  });

  if (!response.ok || !response.body) {
    const detail = await response
      .json()
      .then((body: { error?: string }) => body.error)
      .catch(() => undefined);

    options.onEvent({
      type: "error",
      message: detail || "The assistant could not be reached.",
    });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let newline: number;
    while ((newline = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);

      if (!line.startsWith("data:")) continue;

      const payload = line.slice(5).trim();
      if (payload === "[DONE]" || payload === "") continue;

      try {
        options.onEvent(JSON.parse(payload) as TurnEvent);
      } catch {
        // A frame we cannot read costs one fragment of an answer. Stopping the
        // loop over it would cost the rest of the answer.
      }
    }
  }
}

export type LoadedMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  /** "operator" when a person wrote it while the bot was paused. */
  provider: string | null;
};

export type LoadedConversation = {
  status: string | null;
  messages: LoadedMessage[];
};

/**
 * The transcript of a conversation this visitor already owns.
 *
 * Returns the status as well, because it is what tells the panel whether a
 * person has taken the conversation over — and therefore whether to keep
 * checking back for their replies.
 */
export async function loadHistory(
  conversationId: string,
  options: { channel?: Channel; sessionId?: string; endpoint?: string } = {},
): Promise<LoadedConversation> {
  const url = new URL(options.endpoint ?? "/api/chat", window.location.origin);
  url.searchParams.set("conversationId", conversationId);
  url.searchParams.set("channel", options.channel ?? "web");
  if (options.sessionId) url.searchParams.set("sessionId", options.sessionId);

  try {
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) return { status: null, messages: [] };

    const body = (await response.json()) as {
      status?: string;
      messages?: LoadedMessage[];
    };

    return { status: body.status ?? null, messages: body.messages ?? [] };
  } catch {
    return { status: null, messages: [] };
  }
}

export async function sendFeedback(input: {
  messageId: string;
  rating: 1 | -1;
  channel?: Channel;
  sessionId?: string;
  endpoint?: string;
}): Promise<boolean> {
  try {
    const response = await fetch(input.endpoint ?? "/api/chat/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        messageId: input.messageId,
        rating: input.rating,
        channel: input.channel ?? "web",
        sessionId: input.sessionId,
      }),
    });

    return response.ok;
  } catch {
    return false;
  }
}
