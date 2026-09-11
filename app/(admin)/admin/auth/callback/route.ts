import { redirect } from "next/navigation";
import { authClient } from "@/lib/admin/auth";

/**
 * Where a sign-in link lands.
 *
 * Both shapes are handled on purpose. Supabase sends one or the other depending
 * on whether the project uses PKCE and on which email template is installed,
 * and the failure mode of supporting only one is a link that appears to work
 * and then dumps the operator back on the login form with no explanation:
 *
 *   ?code=…                 — PKCE. Exchanged for a session.
 *   ?token_hash=…&type=…    — the default magic-link template. Verified.
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

  // Only ever a path on this site: a redirect target taken from a query string
  // is an open redirect waiting to be used in a phishing link.
  const next = url.searchParams.get("next");
  const destination = next && next.startsWith("/admin") ? next : "/admin";

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

  return failed("That link did not carry a sign-in token.", url);
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
