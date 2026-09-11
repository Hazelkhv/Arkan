import { getAdminDb } from "@/lib/ai/admin-client";
import { rateLimitSettings } from "@/lib/admin/settings";

/**
 * Per-visitor throttling, counted in the database.
 *
 * Every channel runs on serverless functions, so an in-process counter resets
 * on each cold start and is bypassed entirely by two requests landing on two
 * instances. The counter therefore lives in Postgres, and the increment and the
 * comparison happen in one statement — see bump_rate_limit in
 * supabase/assistant.sql.
 *
 * A failure here allows the request. Rate limiting protects the API budget;
 * refusing to answer a visitor because the limiter itself is broken trades a
 * small cost problem for a lost lead.
 */

export type RateLimitVerdict = {
  allowed: boolean;
  used: number;
  resetsAt: Date | null;
};

/**
 * The chat limit, as an operator has set it.
 *
 * Read from app_settings rather than hardcoded, because the right number
 * depends on how the assistant is being used — a Telegram group and a landing
 * page do not behave alike — and finding that out should not need a deploy.
 */
export async function chatLimit(): Promise<{ windowSeconds: number; max: number }> {
  return rateLimitSettings();
}

export async function checkRateLimit(
  scope: string,
  key: string,
  limit?: { windowSeconds: number; max: number },
): Promise<RateLimitVerdict> {
  const db = getAdminDb();
  if (!db) return { allowed: true, used: 0, resetsAt: null };

  const effective = limit ?? (await rateLimitSettings());

  try {
    const { data, error } = await db.rpc("bump_rate_limit", {
      p_scope: scope,
      p_key: key,
      p_window: effective.windowSeconds,
      p_limit: effective.max,
    });

    if (error) throw new Error(error.message);

    const row = (Array.isArray(data) ? data[0] : data) as
      | { allowed?: boolean; used?: number; resets_at?: string }
      | undefined;

    return {
      allowed: row?.allowed !== false,
      used: Number(row?.used ?? 0),
      resetsAt: row?.resets_at ? new Date(row.resets_at) : null,
    };
  } catch (error) {
    console.error("[arkan] Rate limit check failed, allowing the request:", error);
    return { allowed: true, used: 0, resetsAt: null };
  }
}
