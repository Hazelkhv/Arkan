import { ensureConversation, runTurn } from "@/lib/ai/engine";
import { CHANNELS, type Channel } from "@/lib/ai/types";

/**
 * The web channel's transport.
 *
 * This route is presentation only: it validates the request, turns the brain's
 * events into server-sent events, and nothing else. Every rule about what the
 * assistant says lives in lib/ai/engine.ts, which Telegram and the widget will
 * call the same way.
 *
 * Node runtime rather than edge: the engine uses the Supabase client and
 * streams from OpenRouter, and Node keeps that behaviour identical to the rest
 * of the server code.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_QUESTION = 2000;

/** Crude per-process limiter — enough to blunt a loop, not a real defence. */
const recent = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;

function rateLimited(key: string): boolean {
  const now = Date.now();
  const hits = (recent.get(key) ?? []).filter((at) => now - at < WINDOW_MS);

  hits.push(now);
  recent.set(key, hits);

  // Serverless instances are short-lived, but a warm one should not grow this
  // map without bound.
  if (recent.size > 500) {
    for (const [id, times] of recent) {
      if (times.every((at) => now - at > WINDOW_MS)) recent.delete(id);
    }
  }

  return hits.length > MAX_PER_WINDOW;
}

export async function POST(request: Request): Promise<Response> {
  let body: {
    question?: unknown;
    conversationId?: unknown;
    sessionId?: unknown;
    channel?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const question =
    typeof body.question === "string" ? body.question.trim() : "";

  if (!question) {
    return Response.json({ error: "Ask a question to get started." }, { status: 400 });
  }

  if (question.length > MAX_QUESTION) {
    return Response.json(
      { error: "That message is too long. Please shorten it." },
      { status: 400 },
    );
  }

  const sessionId =
    typeof body.sessionId === "string" && body.sessionId.trim()
      ? body.sessionId.trim().slice(0, 100)
      : null;

  if (!sessionId) {
    return Response.json({ error: "Missing session id." }, { status: 400 });
  }

  const channel: Channel = CHANNELS.includes(body.channel as Channel)
    ? (body.channel as Channel)
    : "web";

  if (rateLimited(sessionId)) {
    return Response.json(
      { error: "That is a lot of questions at once. Give it a moment." },
      { status: 429 },
    );
  }

  let conversationId: string;

  try {
    conversationId = await ensureConversation({
      conversationId:
        typeof body.conversationId === "string" ? body.conversationId : null,
      channel,
      externalId: sessionId,
    });
  } catch (error) {
    console.error("[arkan] Could not open a conversation:", error);

    return Response.json(
      { error: "The assistant is unavailable right now." },
      { status: 503 },
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      // The client needs the id before the first token so it can keep the
      // thread together if the stream drops mid-answer.
      send({ type: "conversation", conversationId });

      try {
        for await (const event of runTurn({ conversationId, channel, question })) {
          send(event);
        }
      } catch (error) {
        console.error("[arkan] Chat stream failed:", error);
        send({
          type: "error",
          message: "Something went wrong on our side. Please try again.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Nginx and some proxies buffer streamed responses into one chunk, which
      // silently turns token streaming back into a long spinner.
      "X-Accel-Buffering": "no",
    },
  });
}
