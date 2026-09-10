import { requireAdminClient } from "@/lib/ai/admin-client";
import { chunkText } from "@/lib/ai/chunking";
import { getEmbeddingSettings } from "@/lib/ai/config";
import { embed } from "@/lib/ai/embeddings";

/**
 * Ingestion: a source becomes searchable chunks.
 *
 * Text extraction is deliberately not here. Parsing PDF and Word needs
 * dependencies that only make sense in the route that receives the upload, so
 * this module takes text that has already been extracted and owns the part that
 * must be identical for every source type: chunk, embed, store, and keep
 * `documents.status` honest about what happened.
 */

const EMBED_BATCH = 32;

export type IngestResult = {
  documentId: string;
  chunkCount: number;
};

export async function createDocument(input: {
  title: string;
  sourceType: "pdf" | "docx" | "text" | "url";
  sourceUrl?: string | null;
  rawText: string;
  tags?: string[];
}): Promise<string> {
  const supabase = requireAdminClient();

  const { data, error } = await supabase
    .from("documents")
    .insert({
      title: input.title.trim(),
      source_type: input.sourceType,
      source_url: input.sourceUrl ?? null,
      raw_text: input.rawText,
      tags: input.tags ?? [],
      status: "pending",
    })
    .select("id")
    .single();

  if (error) throw new Error(`Could not create document: ${error.message}`);

  return data.id as string;
}

/**
 * Chunks, embeds and stores one document.
 *
 * Re-indexing an existing document deletes its chunks first, so this is safe to
 * run again after an embedding-model change or an edit. The delete and the
 * insert are not one transaction — supabase-js cannot express that — so a
 * failure between them leaves the document with no chunks and status 'failed',
 * which is visibly broken rather than silently half-indexed.
 */
export async function indexDocument(documentId: string): Promise<IngestResult> {
  const supabase = requireAdminClient();
  const settings = await getEmbeddingSettings();

  const { data: doc, error: readError } = await supabase
    .from("documents")
    .select("id, title, raw_text")
    .eq("id", documentId)
    .single();

  if (readError) throw new Error(`Document not found: ${readError.message}`);
  if (!doc.raw_text?.trim()) {
    await markFailed(documentId, "The document has no extractable text.");
    throw new Error("The document has no extractable text.");
  }

  await supabase
    .from("documents")
    .update({ status: "processing", error: null, updated_at: new Date().toISOString() })
    .eq("id", documentId);

  try {
    await supabase.from("chunks").delete().eq("document_id", documentId);

    const chunks = chunkText(doc.raw_text, settings.chunkSize, settings.chunkOverlap);

    if (chunks.length === 0) {
      await markFailed(documentId, "Chunking produced nothing.");
      throw new Error("Chunking produced nothing.");
    }

    for (let start = 0; start < chunks.length; start += EMBED_BATCH) {
      const batch = chunks.slice(start, start + EMBED_BATCH);

      const vectors = await embed(
        batch.map((chunk) => ({ text: chunk.content, title: doc.title })),
        "document",
      );

      const rows = batch.map((chunk, offset) => ({
        document_id: documentId,
        chunk_index: chunk.index,
        content: chunk.content,
        token_count: chunk.tokenCount,
        model: settings.model,
        dimensions: settings.dimensions,
        embedding: JSON.stringify(vectors[offset]),
      }));

      const { error: insertError } = await supabase.from("chunks").insert(rows);

      if (insertError) {
        throw new Error(`Could not store chunks: ${insertError.message}`);
      }
    }

    await supabase
      .from("documents")
      .update({
        status: "ready",
        error: null,
        chunk_count: chunks.length,
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);

    return { documentId, chunkCount: chunks.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markFailed(documentId, message);
    throw error;
  }
}

async function markFailed(documentId: string, message: string): Promise<void> {
  const supabase = requireAdminClient();

  await supabase
    .from("documents")
    .update({
      status: "failed",
      error: message.slice(0, 2000),
      chunk_count: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId);
}

/** Creates and indexes in one call — what every ingestion route wants. */
export async function ingestText(input: {
  title: string;
  sourceType: "pdf" | "docx" | "text" | "url";
  sourceUrl?: string | null;
  rawText: string;
  tags?: string[];
}): Promise<IngestResult> {
  const documentId = await createDocument(input);
  return indexDocument(documentId);
}
