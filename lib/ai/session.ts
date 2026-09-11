import type { Channel } from "@/lib/ai/types";

/**
 * Who the visitor is, without asking them.
 *
 * The assistant needs a stable identifier per visitor for two reasons: to bind
 * a conversation to the person who started it, and to rate-limit. It is not an
 * account, it is not linked to a name, and nothing is stored against it beyond
 * the conversation itself.
 *
 * Two channels, two mechanisms, for a reason:
 *
 *   - The full-page chat is first-party, so it gets an httpOnly cookie. The
 *     browser cannot read it, which means a script on the page cannot lift it,
 *     and SameSite=Lax means another site cannot make the browser send it.
 *
 *   - The widget runs on somebody else's domain, where a Lax cookie is never
 *     sent on the request at all. It supplies its own id from the host page's
 *     localStorage instead. That id is client-controlled, so it is treated as a
 *     claim rather than proof: it is a v4 uuid, unguessable in practice, and
 *     the conversation it opens contains only what that same visitor typed.
 */

export const SESSION_COOKIE = "arkan_chat_sid";

const THIRTY_DAYS = 60 * 60 * 24 * 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function newSessionId(): string {
  return crypto.randomUUID();
}

export function readSessionCookie(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;

  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name !== SESSION_COOKIE) continue;

    const value = decodeURIComponent(rest.join("="));
    return UUID.test(value) ? value : null;
  }

  return null;
}

/**
 * The session id for this request, and whether it needs to be sent back.
 *
 * A widget-supplied id is accepted only if it looks like a uuid; anything else
 * is replaced rather than rejected, so a corrupted localStorage entry costs the
 * visitor their history and not their answer.
 */
export function resolveSession(
  request: Request,
  channel: Channel,
  claimed?: unknown,
): { sessionId: string; setCookie: boolean } {
  if (channel === "widget") {
    const id = typeof claimed === "string" && UUID.test(claimed) ? claimed : newSessionId();
    return { sessionId: id, setCookie: false };
  }

  const existing = readSessionCookie(request);
  if (existing) return { sessionId: existing, setCookie: false };

  return { sessionId: newSessionId(), setCookie: true };
}

export function sessionCookieHeader(sessionId: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";

  return (
    `${SESSION_COOKIE}=${sessionId}; Path=/; Max-Age=${THIRTY_DAYS}; ` +
    `HttpOnly; SameSite=Lax${secure}`
  );
}
