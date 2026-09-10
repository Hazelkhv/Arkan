import { requireAdminClient } from "@/lib/ai/admin-client";
import { getEmbeddingSettings } from "@/lib/ai/config";
import { embedQuery } from "@/lib/ai/embeddings";
import type { Citation, RetrievedChunk } from "@/lib/ai/types";

/**
 * Retrieval: question in, grounded context out.
 *
 * Everything tunable — how many chunks, how similar they must be — comes from
 * embedding_config so it can be adjusted from the admin panel and tested in the
 * playground without a deploy.
 */

export async function retrieve(question: string): Promise<RetrievedChunk[]> {
  const trimmed = question.trim();
  if (!trimmed) return [];

  const settings = await getEmbeddingSettings();
  const supabase = requireAdminClient();

  const embedding = await embedQuery(trimmed);

  const { data, error } = await supabase.rpc("match_chunks", {
    query_embedding: embedding as unknown as string,
    match_count: settings.topK,
    threshold: settings.similarityThreshold,
  });

  if (error) throw new Error(`Retrieval failed: ${error.message}`);

  return (data ?? []).map(
    (row: {
      id: string;
      document_id: string;
      content: string;
      similarity: number;
      chunk_index: number;
      title: string;
      source_url: string | null;
    }) => ({
      id: row.id,
      documentId: row.document_id,
      content: row.content,
      similarity: row.similarity,
      chunkIndex: row.chunk_index,
      title: row.title,
      sourceUrl: row.source_url,
    }),
  );
}

/**
 * Formats chunks for the prompt.
 *
 * Each chunk is labelled with its source so the model can attribute a claim,
 * and so a wrong answer can be traced to the passage that caused it. The
 * closing line is a guard rail, repeated here rather than left only in the
 * system prompt because it is the instruction models most often drift from.
 */
export function buildContextBlock(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) {
    return [
      "# Retrieved context",
      "",
      "Nothing in the knowledge base matched this question.",
      "",
      "Say plainly that you do not have that information, offer what you do know",
      "about how Arkan works, and offer to have the team answer it properly.",
      "Do not answer from general knowledge.",
    ].join("\n");
  }

  const passages = chunks.map((chunk, index) => {
    const source = chunk.sourceUrl
      ? `${chunk.title} — ${chunk.sourceUrl}`
      : chunk.title;

    return `[${index + 1}] ${source}\n${chunk.content}`;
  });

  return [
    "# Retrieved context",
    "",
    ...passages,
    "",
    "Answer using only the passages above. If they do not cover the question,",
    "say so rather than filling the gap.",
  ].join("\n\n");
}

/**
 * One citation per document, not per chunk.
 *
 * Three chunks from the same page is one source to a reader, and listing it
 * three times reads like padding.
 */
export function toCitations(chunks: RetrievedChunk[]): Citation[] {
  const best = new Map<string, Citation>();

  for (const chunk of chunks) {
    const existing = best.get(chunk.documentId);

    if (!existing || chunk.similarity > existing.similarity) {
      best.set(chunk.documentId, {
        documentId: chunk.documentId,
        title: chunk.title,
        sourceUrl: chunk.sourceUrl,
        similarity: chunk.similarity,
      });
    }
  }

  return [...best.values()].sort((a, b) => b.similarity - a.similarity);
}
