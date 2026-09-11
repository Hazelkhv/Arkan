import { getAdminDb, requireAdminDb } from "@/lib/ai/admin-client";

/**
 * The handful of operator settings that live in `app_settings`.
 *
 * Read on the hot path by the rate limiter, so cached for a few seconds like
 * everything else the engine reads — and, like everything else, the cache is
 * what bounds staleness rather than an invalidation that serverless instances
 * would not hear about anyway.
 */

const TTL_MS = 15_000;

type Cached = { at: number; value: unknown };

const cache = new Map<string, Cached>();

export type RateLimitSettings = { windowSeconds: number; max: number };
export type RetentionSettings = { conversationDays: number };

export const DEFAULT_RATE_LIMIT: RateLimitSettings = { windowSeconds: 60, max: 12 };
export const DEFAULT_RETENTION: RetentionSettings = { conversationDays: 0 };

async function read<T>(key: string, fallback: T): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;

  const db = getAdminDb();
  if (!db) return fallback;

  const { data, error } = await db
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  if (error || !data) {
    // A missing settings row must not take the assistant down: the default is
    // the same value the migration seeds, so this path is indistinguishable
    // from a fresh install.
    return fallback;
  }

  const value = { ...fallback, ...((data as { value?: object }).value ?? {}) } as T;
  cache.set(key, { at: Date.now(), value });

  return value;
}

export function invalidateSettingsCache(): void {
  cache.clear();
}

export async function rateLimitSettings(): Promise<RateLimitSettings> {
  const value = await read("rate_limit", DEFAULT_RATE_LIMIT);

  return {
    windowSeconds: clamp(value.windowSeconds, 10, 3600, DEFAULT_RATE_LIMIT.windowSeconds),
    max: clamp(value.max, 1, 500, DEFAULT_RATE_LIMIT.max),
  };
}

export async function retentionSettings(): Promise<RetentionSettings> {
  const value = await read("retention", DEFAULT_RETENTION);

  return {
    conversationDays: clamp(value.conversationDays, 0, 3650, 0),
  };
}

export async function writeSetting(
  key: string,
  value: Record<string, unknown>,
  updatedBy: string,
): Promise<void> {
  const { error } = await requireAdminDb()
    .from("app_settings")
    .upsert(
      { key, value, updated_at: new Date().toISOString(), updated_by: updatedBy },
      { onConflict: "key" },
    );

  if (error) throw new Error(error.message);

  invalidateSettingsCache();
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}
