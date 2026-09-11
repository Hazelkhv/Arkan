import { requireAdminDb } from "@/lib/ai/admin-client";
import { embedQuery } from "@/lib/ai/embeddings";
import type {
  Citation,
  EmbeddingSettings,
  RetrievedChunk,
} from "@/lib/ai/types";

/**
 * Finding the passages that should answer a question.
 *
 * Embed the question in query direction, run a cosine search against the
 * knowledge base, drop anything below the operator's similarity threshold, and
 * optionally rerank what survives.
 *
 * The empty result is the important one. When nothing clears the threshold the
 * engine is told so explicitly, and the assistant says it does not know rather
 * than answering from the model's own memory of the world. For an advisory
 * whose first brand value is "honesty before the contract", a confident
 * invention is a worse failure than an admission.
 */

export type RetrievalResult = {
  chunks: RetrievedChunk[];
  citations: Citation[];
  topSimilarity: number | null;
  /** True when the reranker reordered these; recorded for the debug view. */
  reranked: boolean;
};

export const EMPTY_RETRIEVAL: RetrievalResult = {
  chunks: [],
  citations: [],
  topSimilarity: null,
  reranked: false,
};

export async function retrieve(
  question: string,
  settings: EmbeddingSettings,
  options: { tags?: string[] } = {},
): Promise<RetrievalResult> {
  const query = question.trim();
  if (!query) return EMPTY_RETRIEVAL;

  const embedding = await embedQuery(query, settings);

  // Over-fetch when reranking: the reranker's job is to reorder a wider net,
  // and handing it exactly top_k rows gives it nothing to improve.
  const wanted = settings.rerankerEnabled
    ? Math.max(settings.topK, settings.rerankCandidates)
    : settings.topK;

  const db = requireAdminDb();

  const { data, error } = await db.rpc("match_chunks", {
    query_embedding: embedding as unknown as string,
    match_count: wanted,
    threshold: settings.similarityThreshold,
    filter_tags: options.tags && options.tags.length > 0 ? options.tags : null,
  });

  if (error) {
    throw new Error(`Similarity search failed: ${error.message}`);
  }

  const rows = (data ?? []) as Record<string, unknown>[];

  let chunks: RetrievedChunk[] = rows.map((row) => ({
    id: row.id as string,
    documentId: row.document_id as string,
    content: row.content as string,
    similarity: Number(row.similarity),
    chunkIndex: Number(row.chunk_index),
    title: (row.title as string) ?? "Untitled",
    sourceUrl: (row.source_url as string | null) ?? null,
  }));

  if (chunks.length === 0) return EMPTY_RETRIEVAL;

  let reranked = false;

  if (settings.rerankerEnabled) {
    const reordered = await rerank(query, chunks, settings);
    if (reordered) {
      chunks = reordered;
      reranked = true;
    }
  }

  chunks = chunks.slice(0, settings.topK);

  return {
    chunks,
    citations: toCitations(chunks),
    topSimilarity: chunks[0]?.similarity ?? null,
    reranked,
  };
}

/**
 * One citation per document, not per chunk.
 *
 * Three chunks of the same page are one source to a reader, however many times
 * the retriever matched them. Order follows the best chunk from each document,
 * so the most relevant source is listed first.
 */
export function toCitations(chunks: RetrievedChunk[]): Citation[] {
  const best = new Map<string, Citation>();

  for (const chunk of chunks) {
    const existing = best.get(chunk.documentId);
    if (existing && existing.similarity >= chunk.similarity) continue;

    best.set(chunk.documentId, {
      documentId: chunk.documentId,
      title: chunk.title,
      sourceUrl: chunk.sourceUrl,
      similarity: chunk.similarity,
    });
  }

  return [...best.values()].sort((a, b) => b.similarity - a.similarity);
}

/**
 * Cohere rerank, when the operator has switched it on.
 *
 * A failure here returns null rather than throwing: reranking is an
 * improvement to an ordering that is already usable, so losing it should cost
 * a little relevance and never the answer itself.
 */
async function rerank(
  query: string,
  chunks: RetrievedChunk[],
  settings: EmbeddingSettings,
): Promise<RetrievedChunk[] | null> {
  const key = process.env.COHERE_API_KEY;
  const model = settings.rerankerModel;

  if (!key || !model || (settings.rerankerProvider || "cohere") !== "cohere") {
    console.warn(
      "[arkan] Reranking is enabled but not configured; using similarity order.",
    );
    return null;
  }

  try {
    const response = await fetch("https://api.cohere.com/v2/rerank", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        query,
        documents: chunks.map((chunk) => chunk.content),
        top_n: settings.topK,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    const body = (await response.json()) as {
      results?: { index?: number; relevance_score?: number }[];
    };

    const results = body.results ?? [];
    if (results.length === 0) return null;

    return results
      .map((result) => {
        const chunk = chunks[result.index ?? -1];
        if (!chunk) return null;
        // The rerank score replaces the cosine similarity, because it is what
        // this ordering now means. Showing a visitor a confidence figure that
        // did not decide the order would be showing them the wrong number.
        return { ...chunk, similarity: result.relevance_score ?? chunk.similarity };
      })
      .filter((chunk): chunk is RetrievedChunk => chunk !== null);
  } catch (error) {
    console.error("[arkan] Rerank failed, falling back to similarity order:", error);
    return null;
  }
}

/**
 * The retrieved passages, as the model sees them.
 *
 * Numbered so the prompt can tell the model to cite by number, and labelled
 * with the document title so a citation means something to a reader.
 */
export function formatContext(chunks: RetrievedChunk[]): string {
  return chunks
    .map(
      (chunk, i) =>
        `[${i + 1}] ${chunk.title}${chunk.sourceUrl ? ` (${chunk.sourceUrl})` : ""}\n${chunk.content}`,
    )
    .join("\n\n---\n\n");
}
