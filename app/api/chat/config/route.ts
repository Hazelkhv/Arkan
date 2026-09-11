import { isAssistantConfigured } from "@/lib/ai/admin-client";
import { getChannelSettings } from "@/lib/ai/config";

/**
 * What the site's launcher needs before it draws anything.
 *
 * The same three values /consultant reads on the server, served to the bubble
 * instead — because the bubble lives in the site's root layout, and reading the
 * database there would decide the question the wrong way whichever way it went.
 * A plain await in a layout is invisible to Next's prerender analysis, so the
 * settings would be baked in at build time and an operator's switch would do
 * nothing until the next deploy; `force-dynamic` would fix that by making every
 * marketing page render per request. Fetching after hydration keeps the
 * marketing pages static and the settings live. The launcher is not
 * above-the-fold content, so arriving a moment after paint costs nothing.
 *
 * Same-origin only — no CORS headers here. The cross-origin surface is
 * /api/widget/config, which has the domain allowlist to go with it.
 */

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  if (!isAssistantConfigured()) return json({ enabled: false });

  const settings = await getChannelSettings("web").catch(() => null);

  if (!settings?.enabled) return json({ enabled: false });

  return json({
    enabled: true,
    welcome: settings.welcomeMessage,
    starters: settings.quickReplies ?? [],
  });
}

function json(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
