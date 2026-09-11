import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Keeps an admin's session alive.
 *
 * Supabase access tokens are short-lived and are refreshed by reading them.
 * A Server Component cannot set a cookie, so if nothing else refreshed the
 * session, an operator would be signed out mid-task and the symptoms — random
 * logouts, a form that submits into a redirect — point nowhere near the cause.
 *
 * Scoped to /admin. The website, the chat and the webhooks have no session to
 * refresh, and every request that runs this is a request that pays for it.
 */

export const config = {
  matcher: ["/admin/:path*"],
};

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Nothing configured: let the request through and let the page say so.
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(list, headers) {
        for (const { name, value, options } of list) {
          response.cookies.set(name, value, options);
        }
        // A response that sets an auth cookie must never be cached: a CDN
        // would hand one operator's session to the next visitor.
        for (const [header, value] of Object.entries(headers)) {
          response.headers.set(header, value);
        }
      },
    },
  });

  // Reading the user is what performs the refresh. The result is deliberately
  // unused here — authorisation is the panel's job, not the proxy's.
  await supabase.auth.getUser();

  return response;
}
