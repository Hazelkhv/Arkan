import { requireAdminClient } from "@/lib/ai/admin-client";
import type { Channel, EmbeddingSettings, ModelSettings } from "@/lib/ai/types";

/**
 * Runtime configuration, read from the database rather than the environment.
 *
 * The persona, the active model and every retrieval knob are editable from the
 * admin panel and take effect without a deploy — that is the whole point of
 * keeping them in tables. Only secrets live in env vars.
 *
 * Values are cached per process for a short window. A serverless instance is
 * short-lived anyway, so this mostly saves repeated round trips inside a single
 * conversation while still letting an admin change a setting and see it apply
 * within seconds.
 */

const TTL_MS = 30_000;

type Cached<T> = { value: T; at: number };

let modelCache = new Map<string, Cached<ModelSettings>>();
let embeddingCache: Cached<EmbeddingSettings> | null = null;
let promptCache: Cached<string> | null = null;

function fresh<T>(entry: Cached<T> | null | undefined): T | null {
  if (!entry) return null;
  return Date.now() - entry.at < TTL_MS ? entry.value : null;
}

/** Clears every cache. Called by the admin panel after a settings write. */
export function invalidateConfigCache(): void {
  modelCache = new Map();
  embeddingCache = null;
  promptCache = null;
}

type ScheduleEntry = {
  /** ISO weekdays, 1 = Monday .. 7 = Sunday. */
  days?: number[];
  /** "HH:MM", inclusive. */
  from?: string;
  /** "HH:MM", exclusive. */
  to?: string;
  model?: string;
};

/**
 * Resolves a scheduled model override for right now.
 *
 * The spec asks for "different days can use different models", so a schedule
 * entry may constrain by weekday, by time range, or both. An entry with neither
 * matches always, which makes a temporary global override easy to express.
 *
 * A range where `to` is earlier than `from` is read as crossing midnight —
 * 22:00 to 06:00 means the night, not an empty window.
 */
export function resolveScheduledModel(
  schedule: unknown,
  now = new Date(),
): string | null {
  if (!Array.isArray(schedule)) return null;

  const isoDay = now.getDay() === 0 ? 7 : now.getDay();
  const minutes = now.getHours() * 60 + now.getMinutes();

  const toMinutes = (value: string | undefined): number | null => {
    if (!value) return null;
    const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
    if (!match) return null;
    const h = Number(match[1]);
    const m = Number(match[2]);
    if (h > 23 || m > 59) return null;
    return h * 60 + m;
  };

  for (const raw of schedule as ScheduleEntry[]) {
    if (!raw || typeof raw.model !== "string" || !raw.model) continue;
    if (Array.isArray(raw.days) && raw.days.length && !raw.days.includes(isoDay)) {
      continue;
    }

    const from = toMinutes(raw.from);
    const to = toMinutes(raw.to);

    if (from === null && to === null) return raw.model;
    if (from === null || to === null) continue;

    const inRange =
      from <= to
        ? minutes >= from && minutes < to
        : minutes >= from || minutes < to; // crosses midnight

    if (inRange) return raw.model;
  }

  return null;
}

/**
 * Model settings for a channel.
 *
 * Resolution order: the channel's own row, then the default row (channel is
 * null). A schedule on the resolved row overrides its active_model.
 */
export async function getModelSettings(
  channel: Channel,
): Promise<ModelSettings> {
  const hit = fresh(modelCache.get(channel));
  if (hit) return hit;

  const supabase = requireAdminClient();

  const { data, error } = await supabase
    .from("model_config")
    .select(
      "channel, provider, active_model, fallback_model, temperature, max_tokens, top_p, schedule, monthly_budget_usd",
    )
    .or(`channel.eq.${channel},channel.is.null`);

  if (error) throw new Error(`Could not read model_config: ${error.message}`);

  const row =
    data?.find((r) => r.channel === channel) ?? data?.find((r) => !r.channel);

  if (!row) {
    throw new Error(
      "No model_config row found. Seed a default row with channel = null.",
    );
  }

  const settings: ModelSettings = {
    provider: row.provider,
    activeModel: resolveScheduledModel(row.schedule) ?? row.active_model,
    fallbackModel: row.fallback_model,
    temperature: Number(row.temperature),
    maxTokens: row.max_tokens,
    topP: Number(row.top_p),
    monthlyBudgetUsd:
      row.monthly_budget_usd === null ? null : Number(row.monthly_budget_usd),
  };

  modelCache.set(channel, { value: settings, at: Date.now() });
  return settings;
}

export async function getEmbeddingSettings(): Promise<EmbeddingSettings> {
  const hit = fresh(embeddingCache);
  if (hit) return hit;

  const supabase = requireAdminClient();

  const { data, error } = await supabase
    .from("embedding_config")
    .select("*")
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw new Error(`Could not read embedding_config: ${error.message}`);
  if (!data) throw new Error("No active embedding_config row found.");

  const settings: EmbeddingSettings = {
    provider: data.provider,
    model: data.model,
    dimensions: data.dimensions,
    chunkSize: data.chunk_size,
    chunkOverlap: data.chunk_overlap,
    topK: data.top_k,
    similarityThreshold: Number(data.similarity_threshold),
    rerankerEnabled: data.reranker_enabled,
    rerankerModel: data.reranker_model,
  };

  embeddingCache = { value: settings, at: Date.now() };
  return settings;
}

export async function getSystemPrompt(): Promise<string> {
  const hit = fresh(promptCache);
  if (hit) return hit;

  const supabase = requireAdminClient();

  const { data, error } = await supabase
    .from("prompt_versions")
    .select("content")
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw new Error(`Could not read prompt_versions: ${error.message}`);
  if (!data) throw new Error("No active prompt_versions row found.");

  promptCache = { value: data.content, at: Date.now() };
  return data.content;
}
