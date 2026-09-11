import { isAssistantConfigured, requireAdminDb } from "@/lib/ai/admin-client";
import { getChannelSettings } from "@/lib/ai/config";
import { runTurn } from "@/lib/ai/engine";
import { loadMessages } from "@/lib/ai/memory";
import { isAllowed } from "@/lib/ai/origins";
import { resolveSession, sessionCookieHeader } from "@/lib/ai/session";
import { channels, type Channel, type TurnEvent } from "@/lib/ai/types";
import { assistant } from "@/lib/content";

/**
 * The web transport for the assistant.
 *
 * This file knows how to read a request and how to write server-sent events.
 * It knows nothing about retrieval, the persona, tools or cost — all of that is
 * behind runTurn, which Telegram calls too. If a rule about what the assistant
 * says ever appears in this file, it is in the wrong place.
 */

// Streaming, per-visitor and cookie-bound: there is nothing here to cache.
export const dynamic = "force-dynamic";

/** Vercel's default would cut a long answer off mid-sentence. */
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  if (!isAssistantConfigured()) {
    return json({ error: assistant.offline }, 503);
  }

  let body: {
    message?: unknown;
    conversationId?: unknown;
    channel?: unknown;
    sessionId?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return json({ error: "Send JSON." }, 400);
  }

  const message = typeof body.message === "string" ? body.message : "";
  if (!message.trim()) {
    return json({ error: assistant.emptyMessage }, 400);
  }

  const channel = toChannel(body.channel);

  const settings = await getChannelSettings(channel);
  if (!settings.enabled) {
    return json({ error: assistant.offline }, 503);
  }

  // The widget runs on other people's domains, so its origin is checked against
  // the allowlist. An empty allowlist refuses everything: a list nobody has
  // filled in must not mean "anywhere at all".
  if (channel === "widget") {
    const origin = request.headers.get("origin");

    if (!origin || !isAllowed(origin, settings.allowedDomains)) {
      return json({ error: "This site is not allowed to use the assistant." }, 403);
    }
  }

  const { sessionId, setCookie } = resolveSession(request, channel, body.sessionId);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();

      const send = (event: TurnEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        for await (const event of runTurn({
          channel,
          externalUserId: sessionId,
          message,
          conversationId:
            typeof body.conversationId === "string" ? body.conversationId : undefined,
        })) {
          send(event);
        }
      } catch (error) {
        // runTurn handles its own failures; anything arriving here is the
        // transport itself breaking, and the visitor still needs a sentence.
        console.error("[arkan] Chat stream failed:", error);
        send({ type: "error", message: assistant.errorMessage });
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  const headers = new Headers({
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    // Nginx and some CDNs buffer a response until it completes, which turns a
    // stream into a long wait followed by the whole answer at once.
    "x-accel-buffering": "no",
  });

  if (setCookie) headers.append("set-cookie", sessionCookieHeader(sessionId));
  if (channel === "widget") applyCors(headers, request.headers.get("origin"));

  return new Response(stream, { status: 200, headers });
}

/**
 * The conversation this visitor is in the middle of, so a reload does not lose
 * it.
 *
 * The conversation id alone is not enough to read a transcript: it is checked
 * against the session that owns it, because ids travel in URLs and logs and one
 * visitor's transcript is not another's to read.
 */
export async function GET(request: Request): Promise<Response> {
  if (!isAssistantConfigured()) {
    return json({ error: assistant.offline }, 503);
  }

  const url = new URL(request.url);
  const conversationId = url.searchParams.get("conversationId");
  const channel = toChannel(url.searchParams.get("channel"));

  if (!conversationId) return json({ messages: [] });

  const { sessionId } = resolveSession(
    request,
    channel,
    url.searchParams.get("sessionId"),
  );

  const db = requireAdminDb();

  const { data: user } = await db
    .from("unified_users")
    .select("id")
    .eq("channel", channel)
    .eq("external_id", sessionId)
    .maybeSingle();

  const userId = (user as { id?: string } | null)?.id;
  if (!userId) return json({ messages: [] });

  const { data } = await db
    .from("conversations")
    .select("id, status")
    .eq("id", conversationId)
    .eq("channel", channel)
    .eq("user_id", userId)
    .maybeSingle();

  const row = data as { id: string; status: string } | null;

  if (!row) {
    // Not "forbidden": telling a guesser that the id exists is more than they
    // need to know. As far as this response goes, there is no such conversation.
    return json({ messages: [] });
  }

  const messages = await loadMessages(conversationId);

  return json({
    conversationId,
    status: row.status,
    messages: messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
      // Carried through so the panel can label an operator's reply as coming
      // from a person rather than from the assistant.
      provider: message.provider,
    })),
  });
}

export async function OPTIONS(request: Request): Promise<Response> {
  const headers = new Headers();
  applyCors(headers, request.headers.get("origin"));
  return new Response(null, { status: 204, headers });
}

function toChannel(value: unknown): Channel {
  return typeof value === "string" && (channels as readonly string[]).includes(value)
    ? (value as Channel)
    : "web";
}

function applyCors(headers: Headers, origin: string | null): void {
  if (!origin) return;

  // Echoing the origin rather than "*" because the check that matters already
  // happened in POST; this only makes the browser deliver the response.
  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-methods", "POST, GET, OPTIONS");
  headers.set("access-control-allow-headers", "content-type");
  headers.set("vary", "origin");
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
