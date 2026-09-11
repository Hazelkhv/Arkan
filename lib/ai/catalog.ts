import type { ModelSchedule, ModelSettings } from "@/lib/ai/types";

/**
 * The OpenRouter model catalog, fetched rather than remembered.
 *
 * Every generation model is reached through one OpenRouter key, so switching
 * models is a slug change and never a key or a code change. The slugs
 * themselves are the part that rots: a list written from memory at build time
 * names models that have already been retired, and the failure is a 404 from
 * the provider on a visitor's question. So the catalog is fetched live, cached,
 * and used for three things — the admin picker, per-token pricing, and
 * resolving the default model when none is pinned.
 *
 * https://openrouter.ai/api/v1/models needs no key and is safe to call from any
 * server context.
 */

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

const CATALOG_URL = `${OPENROUTER_BASE_URL}/models`;
const CACHE_TTL_MS = 60 * 60 * 1000; // An hour. Models are added, not churned.

export type CatalogModel = {
  id: string;
  name: string;
  description: string;
  contextLength: number;
  maxCompletionTokens: number | null;
  /** USD per single token, already parsed. Multiply by token counts. */
  promptPrice: number;
  completionPrice: number;
  supportsTools: boolean;
  supportsStreaming: boolean;
  /** Provider prefix of the slug: "anthropic", "google", "openai", "qwen"… */
  provider: string;
  /** Unix seconds. Used to prefer the newest member of a model family. */
  created: number;
  /** True for the `~vendor/model-latest` aliases that redirect to a family. */
  isAlias: boolean;
  /** ":free" and ":batch" variants, which are not suitable for a live chat. */
  variant: string | null;
};

type RawModel = {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  context_length?: unknown;
  created?: unknown;
  pricing?: { prompt?: unknown; completion?: unknown };
  top_provider?: { max_completion_tokens?: unknown };
  supported_parameters?: unknown;
};

let cache: { at: number; models: CatalogModel[] } | null = null;
let inFlight: Promise<CatalogModel[]> | null = null;

export async function getCatalog(
  options: { force?: boolean } = {},
): Promise<CatalogModel[]> {
  const fresh = cache && Date.now() - cache.at < CACHE_TTL_MS;
  if (fresh && !options.force) return cache!.models;

  // One fetch even if ten requests arrive at once during a cold start.
  inFlight ??= fetchCatalog()
    .then((models) => {
      cache = { at: Date.now(), models };
      return models;
    })
    .finally(() => {
      inFlight = null;
    });

  try {
    return await inFlight;
  } catch (error) {
    // A stale catalog answers questions; an exception does not. Falling back
    // to the previous copy means an OpenRouter outage cannot take the chat
    // down with it.
    if (cache) {
      console.error("[arkan] Model catalog refresh failed, using the cached copy:", error);
      return cache.models;
    }
    throw error;
  }
}

async function fetchCatalog(): Promise<CatalogModel[]> {
  const response = await fetch(CATALOG_URL, {
    headers: { accept: "application/json" },
    // Next would otherwise cache this in the data cache for the whole build.
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(
      `OpenRouter catalog request failed: ${response.status} ${response.statusText}`,
    );
  }

  const body = (await response.json()) as { data?: unknown };
  const raw = Array.isArray(body.data) ? (body.data as RawModel[]) : [];

  return raw.map(normalise).filter((model): model is CatalogModel => model !== null);
}

function normalise(raw: RawModel): CatalogModel | null {
  const id = typeof raw.id === "string" ? raw.id : null;
  if (!id) return null;

  const params = Array.isArray(raw.supported_parameters)
    ? (raw.supported_parameters as unknown[]).filter(
        (p): p is string => typeof p === "string",
      )
    : [];

  const isAlias = id.startsWith("~");
  const bare = isAlias ? id.slice(1) : id;
  const [providerPart, rest = ""] = bare.split("/", 2);
  const colon = rest.indexOf(":");

  return {
    id,
    name: typeof raw.name === "string" ? raw.name : id,
    description: typeof raw.description === "string" ? raw.description : "",
    contextLength: toNumber(raw.context_length) ?? 0,
    maxCompletionTokens: toNumber(raw.top_provider?.max_completion_tokens),
    promptPrice: toNumber(raw.pricing?.prompt) ?? 0,
    completionPrice: toNumber(raw.pricing?.completion) ?? 0,
    supportsTools: params.includes("tools"),
    // Every OpenRouter chat model streams; the flag exists so a future
    // audio-only or embedding entry can be excluded without a second pass.
    supportsStreaming: true,
    provider: providerPart ?? "unknown",
    created: toNumber(raw.created) ?? 0,
    isAlias,
    variant: colon === -1 ? null : rest.slice(colon + 1),
  };
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The families the default resolution walks, cheapest-and-fastest first.
 *
 * These are patterns, not slugs: `google/gemini-3.5-flash-lite` matches the
 * first entry today and its successor will match it too. RAG customer support
 * is high-volume, long-context and short-answer, which is exactly the tier
 * these describe.
 */
const PREFERRED_FAMILIES: { label: string; pattern: RegExp }[] = [
  { label: "Gemini Flash-Lite", pattern: /^google\/gemini[\w.-]*-flash-lite$/ },
  { label: "Claude Haiku", pattern: /^anthropic\/claude[\w.-]*haiku[\w.-]*$/ },
  { label: "GPT nano", pattern: /^openai\/gpt[\w.-]*-nano$/ },
  { label: "Gemini Flash", pattern: /^google\/gemini[\w.-]*-flash$/ },
  { label: "GPT mini", pattern: /^openai\/gpt[\w.-]*-mini$/ },
  { label: "Qwen Flash", pattern: /^qwen\/qwen[\w.-]*-flash$/ },
];

/**
 * True for a model this assistant can actually run a turn on.
 *
 * Tool support is not optional: capturing a lead and handing over to a person
 * are both tool calls, and they are the two things the bot exists to do.
 */
export function isUsableForChat(model: CatalogModel): boolean {
  return (
    model.supportsTools &&
    model.supportsStreaming &&
    !model.isAlias &&
    // ":batch" is asynchronous and ":free" is rate-limited to the point of
    // being unusable in front of a visitor.
    model.variant === null
  );
}

/**
 * Picks a default model when nothing is pinned in model_config.
 *
 * Walks the preferred families in order and takes the newest usable member of
 * the first family that has one, so the choice follows the provider's own
 * releases without anybody editing a constant.
 */
export function resolveDefaultModel(catalog: CatalogModel[]): CatalogModel | null {
  const usable = catalog.filter(isUsableForChat);

  for (const family of PREFERRED_FAMILIES) {
    const matches = usable
      .filter((model) => family.pattern.test(model.id))
      .sort((a, b) => b.created - a.created);

    if (matches.length > 0) return matches[0];
  }

  // Nothing recognised: the cheapest tool-capable model with room for a RAG
  // prompt is a better answer than failing the request outright.
  const affordable = usable
    .filter((model) => model.contextLength >= 100_000 && model.promptPrice > 0)
    .sort((a, b) => a.promptPrice - b.promptPrice);

  return affordable[0] ?? usable[0] ?? null;
}

export function findModel(
  catalog: CatalogModel[],
  slug: string,
): CatalogModel | null {
  return catalog.find((model) => model.id === slug) ?? null;
}

/**
 * What a turn cost, in dollars.
 *
 * Priced here rather than at read time and stored on the message, so a later
 * price change cannot rewrite history. Null when the model is not in the
 * catalog — an unknown price must not be recorded as a free one.
 */
export function costOf(
  model: CatalogModel | null,
  tokensIn: number,
  tokensOut: number,
): number | null {
  if (!model) return null;
  return model.promptPrice * tokensIn + model.completionPrice * tokensOut;
}

/** The admin picker's shape: providers alphabetical, models newest first. */
export function groupByProvider(
  catalog: CatalogModel[],
): { provider: string; models: CatalogModel[] }[] {
  const groups = new Map<string, CatalogModel[]>();

  for (const model of catalog) {
    const list = groups.get(model.provider);
    if (list) list.push(model);
    else groups.set(model.provider, [model]);
  }

  return [...groups.entries()]
    .map(([provider, models]) => ({
      provider,
      models: models.sort((a, b) => b.created - a.created),
    }))
    .sort((a, b) => a.provider.localeCompare(b.provider));
}

/**
 * Which model a channel should use right now.
 *
 * Order of precedence, strictest first: a schedule window that covers this
 * moment, then the pinned active_model, then the live catalog's default. The
 * schedule wins because that is the whole point of setting one — "use the
 * cheap model outside office hours" has to override the standing choice.
 */
export function selectModel(
  settings: ModelSettings,
  catalog: CatalogModel[],
  now: Date = new Date(),
): { slug: string; source: "schedule" | "pinned" | "catalog" } | null {
  const scheduled = matchSchedule(settings.schedule, now);
  if (scheduled) return { slug: scheduled, source: "schedule" };

  if (settings.activeModel) return { slug: settings.activeModel, source: "pinned" };

  const resolved = resolveDefaultModel(catalog);
  return resolved ? { slug: resolved.id, source: "catalog" } : null;
}

/**
 * The first schedule window covering `now`, or null.
 *
 * Windows are evaluated in the timezone each one names, defaulting to Tehran:
 * the office these working hours belong to. A window whose `to` is earlier than
 * its `from` wraps past midnight, which is how "18:00 to 09:00" is written.
 */
export function matchSchedule(
  schedule: ModelSchedule[],
  now: Date,
): string | null {
  for (const window of schedule) {
    if (!window?.model) continue;

    const { weekday, minutes } = localParts(now, window.tz || "Asia/Tehran");
    if (Array.isArray(window.days) && window.days.length > 0) {
      if (!window.days.includes(weekday)) continue;
    }

    const from = toMinutes(window.from);
    const to = toMinutes(window.to);
    if (from === null || to === null) continue;

    const inside =
      from <= to
        ? minutes >= from && minutes < to
        : minutes >= from || minutes < to;

    if (inside) return window.model;
  }

  return null;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function localParts(now: Date, timeZone: string): {
  weekday: number;
  minutes: number;
} {
  // Intl rather than manual offset arithmetic: Tehran has changed its DST rules
  // twice, and a hardcoded +03:30 is wrong in whichever direction it is wrong.
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  const weekday = WEEKDAYS.indexOf(get("weekday")) + 1; // 1 = Monday
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));

  return {
    weekday: weekday || 1,
    minutes: (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0),
  };
}

function toMinutes(value: string | undefined): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  return hours * 60 + minutes;
}
