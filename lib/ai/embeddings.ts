import { getEmbeddingSettings } from "@/lib/ai/config";
import type {
  EmbeddingInput,
  EmbeddingPurpose,
  EmbeddingSettings,
} from "@/lib/ai/types";

/**
 * Embedding, behind one interface with a provider adapter underneath.
 *
 * OpenRouter covers chat models but not embeddings, so this is a separate key
 * and a separate provider choice from generation. The active provider and model
 * come from embedding_config, so switching is a settings change — but see the
 * dimension warning below, because it is never *only* a settings change.
 */

/**
 * Google's current model, verified against its documentation rather than
 * recalled: `gemini-embedding-2` does NOT take the `task_type` parameter older
 * Google embedding models used. Retrieval direction is expressed by formatting
 * the text itself, which is what `applyGooglePurpose` does. Getting this wrong
 * degrades retrieval quietly — the calls still succeed.
 */
function applyGooglePurpose(
  input: EmbeddingInput,
  purpose: EmbeddingPurpose,
): string {
  if (purpose === "query") {
    return `task: search result | query: ${input.text}`;
  }

  return input.title
    ? `title: ${input.title} | text: ${input.text}`
    : `text: ${input.text}`;
}

async function embedWithGoogle(
  inputs: EmbeddingInput[],
  purpose: EmbeddingPurpose,
  settings: EmbeddingSettings,
): Promise<number[][]> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "GOOGLE_AI_API_KEY is not set. It is required while embedding_config.provider is 'google'.",
    );
  }

  // Batched, because gemini-embedding-2 collapses several inputs in one
  // `content` into a single aggregated vector. One request, one Content per
  // chunk, one vector back per chunk.
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:batchEmbedContents`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      requests: inputs.map((input) => ({
        model: `models/${settings.model}`,
        content: { parts: [{ text: applyGooglePurpose(input, purpose) }] },
        outputDimensionality: settings.dimensions,
      })),
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Google embedding failed (${response.status}): ${detail.slice(0, 400)}`,
    );
  }

  const payload = (await response.json()) as {
    embeddings?: { values?: number[] }[];
  };

  const vectors = payload.embeddings?.map((e) => e.values ?? []) ?? [];

  if (vectors.length !== inputs.length) {
    throw new Error(
      `Google returned ${vectors.length} embeddings for ${inputs.length} inputs.`,
    );
  }

  return vectors.map((vector) => normalise(vector, settings.dimensions));
}

/**
 * Matryoshka models are trained so a truncated vector is still meaningful, but
 * truncation removes the unit norm — cosine distance in pgvector assumes we did
 * not silently change the magnitude. Renormalising keeps similarity scores
 * comparable across chunks embedded at different times.
 */
function normalise(vector: number[], expected: number): number[] {
  if (vector.length !== expected) {
    throw new Error(
      `Embedding has ${vector.length} dimensions, expected ${expected}. ` +
        "The active embedding_config does not match what the provider returned.",
    );
  }

  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (magnitude === 0) return vector;

  return vector.map((v) => v / magnitude);
}

/**
 * Embeds a batch.
 *
 * `purpose` is not optional on purpose. Embedding a search query the same way
 * as a stored document is the most common way to build a RAG system that
 * retrieves plausible-looking nonsense, and an optional parameter is an
 * invitation to forget it.
 */
export async function embed(
  inputs: EmbeddingInput[],
  purpose: EmbeddingPurpose,
): Promise<number[][]> {
  if (inputs.length === 0) return [];

  const settings = await getEmbeddingSettings();

  switch (settings.provider) {
    case "google":
      return embedWithGoogle(inputs, purpose, settings);

    // The admin panel offers these, and embedding_config accepts them, but the
    // adapters are not written yet. Failing with the provider named beats
    // failing with a generic error deep inside a retrieval call.
    case "openai":
    case "cohere":
    case "voyage":
      throw new Error(
        `The '${settings.provider}' embedding adapter is not implemented yet. ` +
          "Set embedding_config.provider to 'google', or add the adapter in lib/ai/embeddings.ts.",
      );

    default:
      throw new Error(`Unknown embedding provider: ${settings.provider}`);
  }
}

/** Convenience for the single-input case, which is every search query. */
export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embed([{ text }], "query");
  return vector;
}
