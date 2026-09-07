import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client.
 *
 * This module must only ever be imported from server code — it reads secrets
 * that are not prefixed with NEXT_PUBLIC_ and must never reach the browser.
 *
 * Two ways to authorise the insert, in order of preference:
 *
 *   1. SUPABASE_SERVICE_ROLE_KEY — bypasses RLS. Server-only, never exposed.
 *   2. the anon key — relies on the insert-only RLS policy in
 *      supabase/schema.sql. Works, but leaves nothing to fall back on if that
 *      policy is ever changed.
 *
 * Returns null when nothing is configured, which is what switches lib/leads.ts
 * over to its fallback store.
 */

let cached: SupabaseClient | null | undefined;

export function getSupabase(): SupabaseClient | null {
  if (cached !== undefined) return cached;

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  cached =
    url && key
      ? createClient(url, key, { auth: { persistSession: false } })
      : null;

  return cached;
}

export function isSupabaseConfigured(): boolean {
  return getSupabase() !== null;
}
