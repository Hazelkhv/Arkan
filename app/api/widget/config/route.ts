import { isAllowed } from "@/lib/ai/origins";
import { isAssistantConfigured } from "@/lib/ai/admin-client";
import { getChannelSettings } from "@/lib/ai/config";
import { assistant, company } from "@/lib/content";

/**
 * What the loader script needs before it can draw anything.
 *
 * This is also the first gate on the domain allowlist. A site that is not on
 * the list gets `enabled: false` and never renders a launcher at all, so the
 * refusal happens before a visitor sees a button that would not work. The real
 * enforcement is still in /api/chat — a loader is client code and can be
 * lied to — but failing early is what makes the allowlist feel like a setting
 * rather than a trap.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const origin = request.headers.get("origin") || new URL(request.url).searchParams.get("origin");

  if (!isAssistantConfigured()) return respond({ enabled: false }, origin);

  const settings = await getChannelSettings("widget").catch(() => null);

  if (!settings?.enabled || !origin || !isAllowed(origin, settings.allowedDomains)) {
    return respond({ enabled: false }, origin);
  }

  const appearance = settings.appearance as {
    accent?: unknown;
    position?: unknown;
    launcherLabel?: unknown;
  };

  return respond(
    {
      enabled: true,
      // Pine, because the launcher is a primary call to action and the brand
      // guide allows exactly one colour for that. An operator can override it,
      // and the label is always shown as text beside the mark so the button
      // never depends on the contrast of whatever they choose.
      accent: asString(appearance.accent) || "#143A32",
      position: appearance.position === "left" ? "left" : "right",
      launcherLabel: asString(appearance.launcherLabel) || assistant.widget.launcher,
      title: assistant.widget.title,
      closeLabel: assistant.widget.close,
      frameUrl: `${siteOrigin()}/widget`,
      company: company.name,
    },
    origin,
  );
}

export async function OPTIONS(request: Request): Promise<Response> {
  return respond(null, request.headers.get("origin"), 204);
}

function siteOrigin(): string {
  // `||`, not `??`: an empty NEXT_PUBLIC_SITE_URL must fall through.
  return (process.env.NEXT_PUBLIC_SITE_URL || company.url).replace(/\/+$/, "");
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function respond(payload: unknown, origin: string | null, status = 200): Response {
  const headers = new Headers({
    "cache-control": "no-store",
  });

  if (payload !== null) {
    headers.set("content-type", "application/json; charset=utf-8");
  }

  if (origin) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-methods", "GET, OPTIONS");
    headers.set("access-control-allow-headers", "content-type");
    headers.set("vary", "origin");
  }

  return new Response(payload === null ? null : JSON.stringify(payload), {
    status,
    headers,
  });
}
