import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The assistant's database handle. Server-only, service role only.
 *
 * lib/supabase.ts accepts either credential pair because the website form can
 * work through the insert-only RLS policy on `leads`. Nothing here can: every
 * assistant table has RLS enabled and no policy at all, so the publishable key
 * reaches none of them. That is deliberate — the knowledge base, every
 * visitor's conversation and every API setting would otherwise be readable
 * with a key that ships to the browser.
 *
 * The consequence is that SUPABASE_SERVICE_ROLE_KEY is required rather than
 * optional. `null` here means the assistant is not configured, which callers
 * report as a service-unavailable rather than crashing a page render.
 */

let cached: SupabaseClient | null | undefined;

export function getAdminDb(): SupabaseClient | null {
  if (cached !== undefined) return cached;

  // `||`, never `??`: .env.example asks the operator to leave unused values
  // blank, and "" is not nullish, so `??` would let a blank line shadow the
  // fallback instead of deferring to it.
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  cached =
    url && key
      ? createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;

  return cached;
}

/**
 * Same handle, but for the paths that cannot carry on without one.
 *
 * The message names the variable and the reason, because the symptom of a
 * missing service role key — an assistant that answers nothing while the rest
 * of the site works perfectly — points nowhere near the cause.
 */
export function requireAdminDb(): SupabaseClient {
  const db = getAdminDb();

  if (!db) {
    throw new Error(
      "The assistant needs SUPABASE_SERVICE_ROLE_KEY. Its tables have row " +
        "level security enabled with no policies, so the publishable key " +
        "cannot read or write any of them. See .env.example.",
    );
  }

  return db;
}

export function isAssistantConfigured(): boolean {
  return getAdminDb() !== null;
}
