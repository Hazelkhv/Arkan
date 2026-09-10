import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for the assistant.
 *
 * SERVER ONLY. This key bypasses row level security completely, and every
 * assistant table is deny-by-default (RLS on, zero policies), so this is the
 * only credential that can reach them. It must never be imported from a Client
 * Component — see lib/ai/README-boundary or the comment in lib/server-leads.ts
 * for the same rule applied to the website form.
 *
 * The website's lib/supabase.ts is deliberately separate: it may fall back to
 * the publishable key, which is correct for an insert-only form and wrong for
 * anything here.
 */

let cached: SupabaseClient | null | undefined;

export function getAdminClient(): SupabaseClient | null {
  if (cached !== undefined) return cached;

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  cached =
    url && key
      ? createClient(url, key, { auth: { persistSession: false } })
      : null;

  return cached;
}

/**
 * Same client, but throwing instead of returning null.
 *
 * The website form degrades gracefully without Supabase because losing a lead
 * is unacceptable. The assistant cannot degrade: with no database there is no
 * knowledge base to answer from, and pretending otherwise would mean answering
 * from the model's imagination — exactly what the brand guide forbids. Failing
 * loudly at the entry point is the honest behaviour.
 */
export function requireAdminClient(): SupabaseClient {
  const client = getAdminClient();

  if (!client) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL are required for the assistant. " +
        "The publishable key cannot be used: assistant tables have RLS enabled with no policies.",
    );
  }

  return client;
}

export function isAssistantConfigured(): boolean {
  return (
    getAdminClient() !== null &&
    Boolean(process.env.OPENROUTER_API_KEY) &&
    Boolean(process.env.GOOGLE_AI_API_KEY)
  );
}
