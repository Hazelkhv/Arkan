import { requireAdminDb } from "@/lib/ai/admin-client";
import { chunkText } from "@/lib/ai/chunking";
import { getEmbeddingSettings } from "@/lib/ai/config";
import { embedDocuments } from "@/lib/ai/embeddings";
import { extractFromFile, extractFromUrl, type SourceType } from "@/lib/ai/extract";

/**
 * A source becomes searchable: extract, chunk, embed, store.
 *
 * `documents.status` is the whole state machine, and it is written before each
 * stage rather than after, so a run that dies halfway leaves a row that says
 * "processing" or "failed" instead of one that looks finished and answers
 * nothing. The admin panel reads that column directly.
 *
 * Re-indexing replaces a document's chunks rather than adding to them. The old
 * rows go in one delete and the new ones arrive in one insert, so the window
 * where a document is half-indexed is as short as it can be — and, because the
 * text is kept on the document row, a re-index never needs the original file
 * back or a second crawl of a page that may have changed underneath us.
 */

export type IngestResult = {
  documentId: string;
  chunks: number;
  tokens: number;
};

export type IngestSource =
  | { kind: "text"; title: string; text: string; tags?: string[] }
  | { kind: "url"; url: string; title?: string; tags?: string[] }
  | {
      kind: "file";
      file: { name: string; type: string; bytes: ArrayBuffer };
      title?: string;
      tags?: string[];
    };

export async function ingest(
  source: IngestSource,
  options: { createdBy?: string | null } = {},
): Promise<IngestResult> {
  const db = requireAdminDb();

  const extracted = await extract(source);

  if (!extracted.text.trim()) {
    throw new Error("There was no text to index in that source.");
  }

  const { data, error } = await db
    .from("documents")
    .insert({
      title: extracted.title,
      source_type: extracted.sourceType,
      source_url: extracted.sourceUrl,
      raw_text: extracted.text,
      tags: source.tags ?? [],
      status: "processing",
      created_by: options.createdBy ?? null,
    })
    .select("id")
    .maybeSingle();

  if (error || !data) {
    throw new Error(`Could not create the document: ${error?.message ?? "no row"}`);
  }

  const documentId = (data as { id: string }).id;

  try {
    return await index(documentId, extracted.text);
  } catch (failure) {
    await markFailed(documentId, failure);
    throw failure;
  }
}

/** Re-embeds a document already in the knowledge base, from its stored text. */
export async function reindex(documentId: string): Promise<IngestResult> {
  const db = requireAdminDb();

  const { data, error } = await db
    .from("documents")
    .select("raw_text")
    .eq("id", documentId)
    .maybeSingle();

  if (error || !data) {
    throw new Error(`No such document: ${documentId}`);
  }

  const text = (data as { raw_text: string | null }).raw_text ?? "";

  if (!text.trim()) {
    throw new Error(
      "This document has no stored text, so it cannot be re-indexed. Upload it again.",
    );
  }

  await db
    .from("documents")
    .update({ status: "processing", error: null, updated_at: new Date().toISOString() })
    .eq("id", documentId);

  try {
    return await index(documentId, text);
  } catch (failure) {
    await markFailed(documentId, failure);
    throw failure;
  }
}

async function index(documentId: string, text: string): Promise<IngestResult> {
  const db = requireAdminDb();
  const settings = await getEmbeddingSettings();

  const chunks = chunkText(text, {
    chunkSize: settings.chunkSize,
    chunkOverlap: settings.chunkOverlap,
    strategy: settings.chunkingStrategy,
  });

  if (chunks.length === 0) {
    throw new Error("The text produced no chunks to embed.");
  }

  const vectors = await embedDocuments(
    chunks.map((chunk) => chunk.content),
    settings,
  );

  // Replace rather than append: a re-index of an edited document would
  // otherwise leave the old passages in the index, still matching, still wrong.
  const { error: clearError } = await db
    .from("chunks")
    .delete()
    .eq("document_id", documentId);

  if (clearError) {
    throw new Error(`Could not clear the old chunks: ${clearError.message}`);
  }

  const { error: insertError } = await db.from("chunks").insert(
    chunks.map((chunk, i) => ({
      document_id: documentId,
      chunk_index: chunk.index,
      content: chunk.content,
      token_count: chunk.tokenCount,
      model: settings.model,
      dimensions: settings.dimensions,
      embedding: vectors[i] as unknown as string,
    })),
  );

  if (insertError) {
    throw new Error(`Could not store the chunks: ${insertError.message}`);
  }

  await db
    .from("documents")
    .update({
      status: "ready",
      error: null,
      chunk_count: chunks.length,
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId);

  return {
    documentId,
    chunks: chunks.length,
    tokens: chunks.reduce((total, chunk) => total + chunk.tokenCount, 0),
  };
}

/**
 * Records why a document is not searchable, where the operator will see it.
 *
 * A failed ingest that leaves no trace is one nobody fixes, because the only
 * symptom is an assistant that does not know something it should.
 */
async function markFailed(documentId: string, failure: unknown): Promise<void> {
  const message = failure instanceof Error ? failure.message : String(failure);

  await requireAdminDb()
    .from("documents")
    .update({
      status: "failed",
      error: message.slice(0, 1000),
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId);
}

async function extract(source: IngestSource): Promise<{
  title: string;
  text: string;
  sourceType: SourceType;
  sourceUrl: string | null;
}> {
  if (source.kind === "text") {
    return {
      title: source.title.trim() || "Untitled",
      text: source.text,
      sourceType: "text",
      sourceUrl: null,
    };
  }

  if (source.kind === "url") {
    const extracted = await extractFromUrl(source.url);
    return {
      title: source.title?.trim() || extracted.title || source.url,
      text: extracted.text,
      sourceType: "url",
      sourceUrl: source.url,
    };
  }

  const extracted = await extractFromFile(source.file);

  return {
    title: source.title?.trim() || extracted.title || source.file.name,
    text: extracted.text,
    sourceType: source.file.name.toLowerCase().endsWith(".pdf")
      ? "pdf"
      : source.file.name.toLowerCase().endsWith(".docx")
        ? "docx"
        : "text",
    sourceUrl: null,
  };
}

export async function deleteDocument(documentId: string): Promise<void> {
  // The chunks go with it: `chunks.document_id` cascades on delete.
  const { error } = await requireAdminDb()
    .from("documents")
    .delete()
    .eq("id", documentId);

  if (error) throw new Error(`Could not delete the document: ${error.message}`);
}
