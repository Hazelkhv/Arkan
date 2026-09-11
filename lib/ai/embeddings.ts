import type { EmbeddingProvider, EmbeddingSettings } from "@/lib/ai/types";

/**
 * Embeddings, from whichever provider the admin panel has selected.
 *
 * OpenRouter is for chat models and does not proxy embeddings, so this is the
 * one place with a second set of API keys. Each provider gets its own key
 * (OPENAI_API_KEY, COHERE_API_KEY, GOOGLE_API_KEY, VOYAGE_API_KEY) and only the
 * active one has to be set.
 *
 * The direction of an embedding matters and is the easiest thing here to get
 * silently wrong. A retrieval model embeds "what is your pricing?" differently
 * from the paragraph that answers it, and every provider expresses that
 * differently — or, in one case, not at all:
 *
 *   - OpenAI has no direction parameter. Its retrieval models are trained
 *     symmetrically, so a query and a document are embedded identically.
 *   - Cohere takes input_type, and requires it: search_query or search_document.
 *   - Voyage takes input_type: "query" or "document", optional but recommended.
 *   - Google's gemini-embedding-001 takes taskType. gemini-embedding-2 removed
 *     it, and expects the instruction in the text instead. Sending taskType to
 *     the newer model, or omitting the instruction, degrades retrieval without
 *     erroring — the calls still succeed and the answers just get worse.
 *
 * Every response is checked against the configured dimension count. A provider
 * that quietly returns its own default width would otherwise be stored as a
 * vector Postgres rejects, or worse, one it accepts and cannot compare.
 */

export type EmbeddingDirection = "query" | "document";

type Batch = { texts: string[]; direction: EmbeddingDirection };

export async function embedQuery(
  text: string,
  settings: EmbeddingSettings,
): Promise<number[]> {
  const [vector] = await embed([text], "query", settings);
  return vector;
}

export async function embedDocuments(
  texts: string[],
  settings: EmbeddingSettings,
): Promise<number[][]> {
  return embed(texts, "document", settings);
}

/** Provider request limits, in inputs per call. */
const BATCH_SIZE: Record<EmbeddingProvider, number> = {
  openai: 96,
  cohere: 96, // Cohere's documented maximum.
  google: 100,
  voyage: 128,
};

export async function embed(
  texts: string[],
  direction: EmbeddingDirection,
  settings: EmbeddingSettings,
): Promise<number[][]> {
  const inputs = texts.map((text) => text.trim()).filter((text) => text !== "");
  if (inputs.length === 0) return [];

  const size = BATCH_SIZE[settings.provider] ?? 32;
  const out: number[][] = [];

  // Sequential rather than parallel: every one of these providers rate-limits
  // by requests per minute, and a re-index of a large document would otherwise
  // fire fifty calls at once and get half of them refused.
  for (let i = 0; i < inputs.length; i += size) {
    const batch: Batch = { texts: inputs.slice(i, i + size), direction };
    out.push(...(await callProvider(batch, settings)));
  }

  for (const vector of out) {
    if (vector.length !== settings.dimensions) {
      throw new Error(
        `${settings.provider}/${settings.model} returned ${vector.length} ` +
          `dimensions but embedding_config says ${settings.dimensions}. ` +
          "Storing these would corrupt the index — fix the configuration and " +
          "re-index rather than letting them through.",
      );
    }
  }

  return out;
}

function callProvider(
  batch: Batch,
  settings: EmbeddingSettings,
): Promise<number[][]> {
  switch (settings.provider) {
    case "openai":
      return embedOpenAI(batch, settings);
    case "cohere":
      return embedCohere(batch, settings);
    case "voyage":
      return embedVoyage(batch, settings);
    case "google":
      return embedGoogle(batch, settings);
    default:
      throw new Error(`Unknown embedding provider: ${settings.provider}`);
  }
}

function requireKey(provider: EmbeddingProvider): string {
  // `||`, not `??`: a blank line in .env must fall through to the next
  // candidate rather than being treated as a configured empty key.
  const key =
    provider === "openai"
      ? process.env.OPENAI_API_KEY
      : provider === "cohere"
        ? process.env.COHERE_API_KEY
        : provider === "voyage"
          ? process.env.VOYAGE_API_KEY
          : process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

  if (!key) {
    throw new Error(
      `The knowledge base is configured to use ${provider} for embeddings, ` +
        `but its API key is not set. See .env.example.`,
    );
  }

  return key;
}

async function post(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    // The body carries the reason — a wrong dimension, an unknown model, a
    // key without access — and the status alone never does.
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Embedding request failed: ${response.status} ${response.statusText} ${detail.slice(0, 500)}`,
    );
  }

  return response.json();
}

// ── OpenAI ──────────────────────────────────────────────────────────────────

async function embedOpenAI(
  batch: Batch,
  settings: EmbeddingSettings,
): Promise<number[][]> {
  const body = await post(
    "https://api.openai.com/v1/embeddings",
    { authorization: `Bearer ${requireKey("openai")}` },
    {
      model: settings.model,
      input: batch.texts,
      // Matryoshka truncation, which is why 1536 from a 3072-wide model is a
      // supported request rather than a lossy one. Sent only for the v3 models;
      // the legacy ada-002 rejects the parameter.
      ...(settings.model.includes("-3-") ? { dimensions: settings.dimensions } : {}),
    },
  );

  const data = (body as { data?: { embedding?: unknown }[] }).data ?? [];
  return data.map((row) => toVector(row.embedding));
}

// ── Cohere ──────────────────────────────────────────────────────────────────

async function embedCohere(
  batch: Batch,
  settings: EmbeddingSettings,
): Promise<number[][]> {
  const body = await post(
    "https://api.cohere.com/v2/embed",
    { authorization: `Bearer ${requireKey("cohere")}` },
    {
      model: settings.model,
      texts: batch.texts,
      input_type:
        batch.direction === "query" ? "search_query" : "search_document",
      embedding_types: ["float"],
      output_dimension: settings.dimensions,
    },
  );

  const floats = (body as { embeddings?: { float?: unknown[] } }).embeddings
    ?.float;

  if (!Array.isArray(floats)) {
    throw new Error("Cohere returned no float embeddings.");
  }

  return floats.map(toVector);
}

// ── Voyage ──────────────────────────────────────────────────────────────────

async function embedVoyage(
  batch: Batch,
  settings: EmbeddingSettings,
): Promise<number[][]> {
  const body = await post(
    "https://api.voyageai.com/v1/embeddings",
    { authorization: `Bearer ${requireKey("voyage")}` },
    {
      model: settings.model,
      input: batch.texts,
      input_type: batch.direction,
      output_dimension: settings.dimensions,
    },
  );

  const data = (body as { data?: { embedding?: unknown; index?: number }[] }).data ?? [];

  // Voyage documents the order as matching the input but returns an index on
  // every row, so it costs nothing to honour it.
  return [...data]
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((row) => toVector(row.embedding));
}

// ── Google ──────────────────────────────────────────────────────────────────

/**
 * The instruction prefix that replaces taskType on gemini-embedding-2.
 *
 * Google's guidance for the newer model is to state the task in the text. It
 * has to be applied consistently to both sides of the comparison — a query
 * prefixed and a document not — or retrieval quality drops with no error to
 * explain it.
 */
function applyGooglePurpose(text: string, direction: EmbeddingDirection): string {
  return direction === "query"
    ? `task: search result | query: ${text}`
    : `title: none | text: ${text}`;
}

async function embedGoogle(
  batch: Batch,
  settings: EmbeddingSettings,
): Promise<number[][]> {
  const key = requireKey("google");
  const legacy = settings.model.endsWith("-001");

  const body = await post(
    `https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:batchEmbedContents`,
    { "x-goog-api-key": key },
    {
      requests: batch.texts.map((text) => ({
        model: `models/${settings.model}`,
        content: {
          parts: [
            { text: legacy ? text : applyGooglePurpose(text, batch.direction) },
          ],
        },
        outputDimensionality: settings.dimensions,
        ...(legacy
          ? {
              taskType:
                batch.direction === "query"
                  ? "RETRIEVAL_QUERY"
                  : "RETRIEVAL_DOCUMENT",
            }
          : {}),
      })),
    },
  );

  const embeddings =
    (body as { embeddings?: { values?: unknown }[] }).embeddings ?? [];

  return embeddings.map((row) => toVector(row.values));
}

function toVector(value: unknown): number[] {
  if (!Array.isArray(value)) {
    throw new Error("Embedding provider returned a row without a vector.");
  }

  return value.map((n) => {
    const parsed = typeof n === "string" ? Number(n) : n;
    if (typeof parsed !== "number" || !Number.isFinite(parsed)) {
      throw new Error("Embedding provider returned a non-numeric component.");
    }
    return parsed;
  });
}
