import { requireAdminDb } from "@/lib/ai/admin-client";
import { DEFAULT_PERSONA, DEFAULT_SYSTEM_PROMPT } from "@/lib/ai/persona";
import type {
  Channel,
  ChannelSettings,
  EmbeddingSettings,
  ModelSchedule,
  ModelSettings,
} from "@/lib/ai/types";

/**
 * Everything the engine is allowed to be configured by, read from the database.
 *
 * Nothing in here is a constant in the code. The persona, the model, the
 * chunking parameters and the retrieval thresholds are all operator decisions,
 * and an operator must be able to change them from the admin panel without
 * waiting for a deploy.
 *
 * The cost of that is a database round trip on the hot path, so each value is
 * cached for a few seconds. The window is short deliberately: it collapses the
 * per-request reads of a busy minute into one, while still making a change in
 * the admin panel visible before the operator has finished wondering whether it
 * worked. Serverless instances each hold their own copy, which is why the TTL
 * — and not an in-process invalidation — is what actually bounds staleness.
 */

const TTL_MS = 15_000;

type Cached<T> = { at: number; value: T };

const cache = new Map<string, Cached<unknown>>();

async function memo<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;

  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** Drops the cache so the next read sees a write made moments ago. */
export function invalidateConfigCache(): void {
  cache.clear();
}

// ── Generation model ────────────────────────────────────────────────────────

const MODEL_COLUMNS =
  "channel, provider, active_model, fallback_model, temperature, max_tokens, top_p, schedule, monthly_budget_usd";

/**
 * The model settings for a channel, falling back to the default row.
 *
 * A channel with its own row overrides the default completely rather than
 * merging with it: a half-inherited configuration is impossible to reason about
 * from a settings screen that shows one value per field.
 */
export async function getModelSettings(
  channel: Channel,
): Promise<ModelSettings> {
  return memo(`model:${channel}`, async () => {
    const db = requireAdminDb();

    const { data, error } = await db
      .from("model_config")
      .select(MODEL_COLUMNS)
      .or(`channel.eq.${channel},channel.is.null`);

    if (error) throw new Error(`Reading model_config failed: ${error.message}`);

    const rows = (data ?? []) as Record<string, unknown>[];
    const row =
      rows.find((r) => r.channel === channel) ??
      rows.find((r) => r.channel === null);

    if (!row) {
      throw new Error(
        "model_config has no default row. Run supabase/assistant.sql.",
      );
    }

    return toModelSettings(row);
  });
}

function toModelSettings(row: Record<string, unknown>): ModelSettings {
  return {
    channel: (row.channel as Channel | null) ?? null,
    provider: (row.provider as string) || "openrouter",
    activeModel: (row.active_model as string | null) || null,
    fallbackModel: (row.fallback_model as string | null) || null,
    temperature: numberOr(row.temperature, 0.3),
    maxTokens: Math.trunc(numberOr(row.max_tokens, 1024)),
    topP: numberOr(row.top_p, 1),
    schedule: Array.isArray(row.schedule) ? (row.schedule as ModelSchedule[]) : [],
    monthlyBudgetUsd:
      row.monthly_budget_usd === null || row.monthly_budget_usd === undefined
        ? null
        : numberOr(row.monthly_budget_usd, 0),
  };
}

// ── Embedding and retrieval ─────────────────────────────────────────────────

/**
 * The active embedding row.
 *
 * There is exactly one, enforced by a partial unique index rather than by
 * convention, because two active rows would mean chunks embedded by two models
 * sitting in one index and silently failing to match each other.
 */
export async function getEmbeddingSettings(): Promise<EmbeddingSettings> {
  return memo("embedding", async () => {
    const db = requireAdminDb();

    const { data, error } = await db
      .from("embedding_config")
      .select("*")
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      throw new Error(`Reading embedding_config failed: ${error.message}`);
    }

    if (!data) {
      throw new Error(
        "embedding_config has no active row. Run supabase/assistant.sql.",
      );
    }

    const row = data as Record<string, unknown>;

    return {
      provider: row.provider as EmbeddingSettings["provider"],
      model: row.model as string,
      dimensions: Math.trunc(numberOr(row.dimensions, 1536)),
      chunkSize: Math.trunc(numberOr(row.chunk_size, 500)),
      chunkOverlap: Math.trunc(numberOr(row.chunk_overlap, 50)),
      chunkingStrategy:
        (row.chunking_strategy as EmbeddingSettings["chunkingStrategy"]) ||
        "recursive",
      topK: Math.trunc(numberOr(row.top_k, 6)),
      similarityThreshold: numberOr(row.similarity_threshold, 0.3),
      rerankerEnabled: row.reranker_enabled === true,
      rerankerProvider: (row.reranker_provider as string | null) || null,
      rerankerModel: (row.reranker_model as string | null) || null,
      rerankCandidates: Math.trunc(numberOr(row.rerank_candidates, 24)),
    };
  });
}

// ── Channel presentation ────────────────────────────────────────────────────

export async function getChannelSettings(
  channel: Channel,
): Promise<ChannelSettings> {
  return memo(`channel:${channel}`, async () => {
    const db = requireAdminDb();

    const { data, error } = await db
      .from("channel_settings")
      .select("*")
      .eq("channel", channel)
      .maybeSingle();

    if (error) {
      throw new Error(`Reading channel_settings failed: ${error.message}`);
    }

    const row = (data ?? {}) as Record<string, unknown>;

    return {
      channel,
      // A missing row means "not configured yet", and an unconfigured channel
      // is enabled: the full-page chat must work on a fresh install.
      enabled: data ? row.enabled === true : true,
      welcomeMessage: (row.welcome_message as string | null) || null,
      quickReplies: Array.isArray(row.quick_replies)
        ? (row.quick_replies as string[])
        : [],
      appearance:
        row.appearance && typeof row.appearance === "object"
          ? (row.appearance as Record<string, unknown>)
          : {},
      // The opposite default: an empty allowlist refuses every origin, so
      // forgetting to fill it in cannot embed the widget on any site at all.
      allowedDomains: Array.isArray(row.allowed_domains)
        ? (row.allowed_domains as string[])
        : [],
    };
  });
}

// ── System prompt ───────────────────────────────────────────────────────────

export type ActivePrompt = {
  id: string | null;
  content: string;
  persona: string | null;
};

/**
 * The active system prompt, seeded from lib/ai/persona.ts on first use.
 *
 * The seed happens here rather than in SQL so there is one copy of that text in
 * the repository. It is written only when the table is empty, so an operator's
 * edit is never overwritten by a deploy — and if the insert loses a race with
 * another instance doing the same thing, the unique index on `is_active`
 * rejects the second write and the read below still returns a prompt.
 */
export async function getActivePrompt(): Promise<ActivePrompt> {
  return memo("prompt", async () => {
    const db = requireAdminDb();

    const read = async () =>
      db
        .from("prompt_versions")
        .select("id, content, persona")
        .eq("is_active", true)
        .maybeSingle();

    const { data, error } = await read();
    if (error) {
      throw new Error(`Reading prompt_versions failed: ${error.message}`);
    }

    if (data) {
      const row = data as Record<string, unknown>;
      return {
        id: row.id as string,
        content: row.content as string,
        persona: (row.persona as string | null) || null,
      };
    }

    const { data: seeded, error: seedError } = await db
      .from("prompt_versions")
      .insert({
        label: "Factory default",
        content: DEFAULT_SYSTEM_PROMPT,
        persona: DEFAULT_PERSONA,
        is_active: true,
      })
      .select("id, content, persona")
      .maybeSingle();

    if (seedError) {
      // Almost certainly the unique index refusing a second active row, which
      // means another instance seeded it first. Read theirs.
      const { data: retry } = await read();
      const row = (retry ?? {}) as Record<string, unknown>;

      return {
        id: (row.id as string | undefined) ?? null,
        content: (row.content as string | undefined) ?? DEFAULT_SYSTEM_PROMPT,
        persona: (row.persona as string | undefined) ?? DEFAULT_PERSONA,
      };
    }

    const row = (seeded ?? {}) as Record<string, unknown>;

    return {
      id: (row.id as string | undefined) ?? null,
      content: DEFAULT_SYSTEM_PROMPT,
      persona: DEFAULT_PERSONA,
    };
  });
}

function numberOr(value: unknown, fallback: number): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : fallback;
}
