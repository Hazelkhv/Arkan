import { redirect } from "next/navigation";
import { authClient } from "@/lib/admin/auth";

/**
 * Where a sign-in link lands.
 *
 * Three shapes are handled on purpose. Supabase sends one or another depending
 * on whether the flow was started with PKCE, on which email template is
 * installed, and on whether the link was minted by the admin API, and the
 * failure mode of supporting only some of them is a link that appears to work
 * and then dumps the operator back on the login form with no explanation:
 *
 *   ?code=…                 — PKCE. Exchanged for a session.
 *   ?token_hash=…&type=…    — the default magic-link template. Verified.
 *   #access_token=…         — the implicit flow. See below.
 *
 * The third one is the awkward one, and it is what a link generated without a
 * PKCE challenge actually produces: GoTrue verifies the token itself and
 * redirects here with the session in the URL *fragment*. A fragment is never
 * sent to the server, so this route cannot see it at all — the request looks
 * identical to somebody typing the path in by hand. The only way to read it is
 * in the browser, which is what the page below is for: it hands the tokens back
 * to the POST handler, which is where they can become cookies.
 *
 * Nothing here decides whether the person is allowed in. It establishes who
 * they are; `admin_users` decides the rest, on the next request.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  const destination = safeDestination(url.searchParams.get("next"));

  const supabase = authClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return failed(error.message, url);
    redirect(destination);
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as "magiclink" | "email" | "recovery" | "invite",
      token_hash: tokenHash,
    });
    if (error) return failed(error.message, url);
    redirect(destination);
  }

  // No token in the query. Either the fragment carries one, or this really is
  // a link with nothing in it — and only the browser can tell the two apart.
  return fragmentHandoff(destination);
}

/**
 * The other half of the implicit flow: the tokens the page above read out of
 * the fragment, turned into the session cookies every later request needs.
 *
 * Same-origin only. Setting a session from a body is exactly the shape of a
 * login-CSRF — a forged cross-site POST would sign an operator into somebody
 * else's account and leave them working in it — so a request that did not come
 * from this site is refused before the tokens are looked at.
 */
export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return new Response("Cross-origin sign-in is not accepted.", { status: 403 });
  }

  let accessToken: unknown;
  let refreshToken: unknown;

  try {
    const body = await request.json();
    accessToken = body?.access_token;
    refreshToken = body?.refresh_token;
  } catch {
    return new Response("Malformed sign-in payload.", { status: 400 });
  }

  if (typeof accessToken !== "string" || typeof refreshToken !== "string") {
    return new Response("Malformed sign-in payload.", { status: 400 });
  }

  const { error } = await authClient().auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (error) {
    console.error("[arkan] Admin sign-in failed:", error.message);
    return new Response("That sign-in link is no longer valid.", { status: 401 });
  }

  return new Response(null, { status: 204 });
}

/**
 * Only ever a path on this site: a redirect target taken from a query string is
 * an open redirect waiting to be used in a phishing link. `//evil.test` is a
 * protocol-relative URL rather than a path, which is why the second test is not
 * redundant.
 */
function safeDestination(next: string | null): string {
  if (!next || !next.startsWith("/admin") || next.startsWith("//")) return "/admin";
  return next;
}

/**
 * A page whose entire job is to read the fragment and post it back.
 *
 * It renders nothing an operator will meaningfully see — the round trip takes a
 * moment — but it is a real page rather than a blank one, because the moment is
 * occasionally not that short and an empty white screen mid-sign-in reads as a
 * broken link.
 */
function fragmentHandoff(destination: string): Response {
  const target = JSON.stringify(destination).replace(/</g, "\u003C");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Signing in…</title>
<style>
  body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#F7F3EC;
       color:#5A5F5B;font:400 1rem/1.5 ui-sans-serif,system-ui,sans-serif}
</style></head>
<body><p>Signing you in…</p><script>
(function () {
  var to = ${target};
  var back = "/admin/login?error=link";
  var raw = location.hash.slice(1);

  // Clear it first. The fragment holds a live session, and leaving it in the
  // address bar puts it in history, in a screenshot, and in whatever the
  // operator pastes next.
  history.replaceState(null, "", location.pathname + location.search);

  if (!raw) { location.replace(back); return; }

  var p = new URLSearchParams(raw);
  var access = p.get("access_token");
  var refresh = p.get("refresh_token");

  if (!access || !refresh) { location.replace(back); return; }

  fetch(location.pathname, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: access, refresh_token: refresh }),
  })
    .then(function (r) { location.replace(r.ok ? to : back); })
    .catch(function () { location.replace(back); });
})();
</script></body></html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Back to the login form, with the reason in the server log rather than the
 * query string. "Token expired" and "token already used" are both just an
 * expired link to the operator, and neither is worth telling a stranger.
 */
function failed(reason: string, requestUrl: URL): Response {
  console.error("[arkan] Admin sign-in failed:", reason);

  return Response.redirect(new URL("/admin/login?error=link", requestUrl.origin), 303);
}
