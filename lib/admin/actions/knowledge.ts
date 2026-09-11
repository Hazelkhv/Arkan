"use server";

import { revalidatePath } from "next/cache";
import { requireAdminDb } from "@/lib/ai/admin-client";
import { getEmbeddingSettings } from "@/lib/ai/config";
import { deleteDocument, ingest, reindex } from "@/lib/ai/ingest";
import { retrieve } from "@/lib/ai/retrieve";
import { audit, requireAdmin } from "@/lib/admin/auth";

/**
 * Knowledge base actions.
 *
 * Ingestion runs inside the request rather than in a queue. That is a real
 * limitation and it is worth stating plainly: a very large PDF can outlast a
 * serverless function's time limit, and the document is then left saying
 * "Indexing" with a re-index button beside it. The trade buys an operator who
 * uploads a page of FAQ answers an answer in three seconds instead of a job id,
 * and `documents.status` is what makes the failure visible either way.
 *
 * Every action re-checks the capability. The navigation hides what a role
 * cannot use; this is the part that stops it.
 */

export type ActionState = { ok?: boolean; message?: string };

const MAX_UPLOAD = 20 * 1024 * 1024;

export async function addSource(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin("content");

  const kind = String(formData.get("kind") ?? "text");
  const title = String(formData.get("title") ?? "").trim();
  const tags = String(formData.get("tags") ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  try {
    if (kind === "url") {
      const url = String(formData.get("url") ?? "").trim();
      if (!url) return { message: "Enter the address of the page to read." };

      const result = await ingest(
        { kind: "url", url, title: title || undefined, tags },
        { createdBy: admin.id },
      );

      await audit(admin, "knowledge.add", result.documentId, { kind, url });
      revalidatePath("/admin/knowledge");

      return { ok: true, message: `Indexed ${result.chunks} passages from that page.` };
    }

    if (kind === "file") {
      const file = formData.get("file");

      if (!(file instanceof File) || file.size === 0) {
        return { message: "Choose a PDF, Word document or text file." };
      }

      if (file.size > MAX_UPLOAD) {
        return { message: "That file is larger than 20 MB." };
      }

      const result = await ingest(
        {
          kind: "file",
          file: { name: file.name, type: file.type, bytes: await file.arrayBuffer() },
          title: title || undefined,
          tags,
        },
        { createdBy: admin.id },
      );

      await audit(admin, "knowledge.add", result.documentId, { kind, name: file.name });
      revalidatePath("/admin/knowledge");

      return { ok: true, message: `Indexed ${result.chunks} passages from ${file.name}.` };
    }

    const text = String(formData.get("text") ?? "").trim();
    if (!title) return { message: "Give this a title so it can be recognised later." };
    if (!text) return { message: "There is no text to index." };

    const result = await ingest({ kind: "text", title, text, tags }, { createdBy: admin.id });

    await audit(admin, "knowledge.add", result.documentId, { kind, title });
    revalidatePath("/admin/knowledge");

    return { ok: true, message: `Indexed ${result.chunks} passages.` };
  } catch (error) {
    return { message: reason(error) };
  }
}

export async function reindexDocument(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin("content");
  const id = String(formData.get("documentId") ?? "");

  if (!id) return { message: "No document was named." };

  try {
    const result = await reindex(id);
    await audit(admin, "knowledge.reindex", id);
    revalidatePath("/admin/knowledge");

    return { ok: true, message: `Re-indexed into ${result.chunks} passages.` };
  } catch (error) {
    return { message: reason(error) };
  }
}

export async function removeDocument(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin("content");
  const id = String(formData.get("documentId") ?? "");

  if (!id) return { message: "No document was named." };

  try {
    await deleteDocument(id);
    await audit(admin, "knowledge.delete", id);
    revalidatePath("/admin/knowledge");

    return { ok: true, message: "Deleted, along with its passages." };
  } catch (error) {
    return { message: reason(error) };
  }
}

export async function renameDocument(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin("content");
  const id = String(formData.get("documentId") ?? "");
  const title = String(formData.get("title") ?? "").trim();

  if (!id || !title) return { message: "A document and a title are both needed." };

  const { error } = await requireAdminDb()
    .from("documents")
    .update({ title, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { message: error.message };

  await audit(admin, "knowledge.rename", id, { title });
  revalidatePath("/admin/knowledge");

  return { ok: true, message: "Renamed." };
}

export type SearchState = {
  message?: string;
  query?: string;
  results?: {
    title: string;
    similarity: number;
    content: string;
    sourceUrl: string | null;
  }[];
};

/**
 * The knowledge base as the retriever sees it.
 *
 * The same call the engine makes, with the same settings, so what this shows is
 * literally what an answer would have been built from — including the empty
 * result, which is the one worth testing for. "Nothing matched" here is the
 * fastest way to find out that a threshold is too strict.
 */
export async function testSearch(
  _previous: SearchState,
  formData: FormData,
): Promise<SearchState> {
  await requireAdmin("content");

  const query = String(formData.get("query") ?? "").trim();
  if (!query) return { message: "Type a question to try." };

  try {
    const settings = await getEmbeddingSettings();
    const result = await retrieve(query, settings);

    return {
      query,
      results: result.chunks.map((chunk) => ({
        title: chunk.title,
        similarity: chunk.similarity,
        content: chunk.content,
        sourceUrl: chunk.sourceUrl,
      })),
    };
  } catch (error) {
    return { query, message: reason(error) };
  }
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : "That did not work.";
}
