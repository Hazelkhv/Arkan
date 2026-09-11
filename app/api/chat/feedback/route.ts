import { isAssistantConfigured, requireAdminDb } from "@/lib/ai/admin-client";
import { checkRateLimit } from "@/lib/ai/rate-limit";
import { resolveSession } from "@/lib/ai/session";
import { channels, type Channel } from "@/lib/ai/types";

/**
 * A thumb up or down on one answer.
 *
 * The rating is stored against the message, and the message is checked against
 * the session that received it — a rating anyone could post against any message
 * id would make the "review the thumbs-down answers" screen worse than useless,
 * because the operator could not tell a real complaint from noise.
 *
 * One rating per message, replaced rather than stacked, which is what the
 * unique index on feedback.message_id enforces and what the UI lets a visitor
 * do when they change their mind.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (!isAssistantConfigured()) {
    return json({ error: "Unavailable." }, 503);
  }

  let body: {
    messageId?: unknown;
    rating?: unknown;
    comment?: unknown;
    channel?: unknown;
    sessionId?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return json({ error: "Send JSON." }, 400);
  }

  const messageId = typeof body.messageId === "string" ? body.messageId : "";
  const rating = body.rating === 1 || body.rating === -1 ? body.rating : null;

  if (!messageId || rating === null) {
    return json({ error: "A message id and a rating of 1 or -1 are required." }, 400);
  }

  const channel: Channel =
    typeof body.channel === "string" && (channels as readonly string[]).includes(body.channel)
      ? (body.channel as Channel)
      : "web";

  const { sessionId } = resolveSession(request, channel, body.sessionId);

  // Generous, but enough to stop a script writing a million rows.
  const limit = await checkRateLimit("feedback", sessionId, {
    windowSeconds: 60,
    max: 30,
  });

  if (!limit.allowed) return json({ error: "Too many ratings." }, 429);

  const db = requireAdminDb();

  const { data: user } = await db
    .from("unified_users")
    .select("id")
    .eq("channel", channel)
    .eq("external_id", sessionId)
    .maybeSingle();

  const userId = (user as { id?: string } | null)?.id;
  if (!userId) return json({ error: "Unknown message." }, 404);

  // The message has to belong to a conversation this visitor owns.
  const { data: message } = await db
    .from("messages")
    .select("conversation_id")
    .eq("id", messageId)
    .maybeSingle();

  const conversationId = (message as { conversation_id?: string } | null)?.conversation_id;
  if (!conversationId) return json({ error: "Unknown message." }, 404);

  const { data: owned } = await db
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!owned) return json({ error: "Unknown message." }, 404);

  const comment =
    typeof body.comment === "string" && body.comment.trim()
      ? body.comment.trim().slice(0, 2000)
      : null;

  const { error } = await db
    .from("feedback")
    .upsert({ message_id: messageId, rating, comment }, { onConflict: "message_id" });

  if (error) {
    console.error("[arkan] Could not store feedback:", error.message);
    return json({ error: "Could not save that." }, 500);
  }

  return json({ ok: true });
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
