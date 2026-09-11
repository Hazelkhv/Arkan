import type { Metadata } from "next";
import { RetrievalForm } from "@/components/admin/RetrievalForm";
import { Card, PageHeader } from "@/components/admin/ui";
import { requireAdminDb } from "@/lib/ai/admin-client";
import { getEmbeddingSettings } from "@/lib/ai/config";
import { requireAdmin } from "@/lib/admin/auth";

/**
 * Embedding and retrieval.
 *
 * The counts at the top are the check nobody thinks to run: passages indexed
 * under a model that is no longer the active one are invisible to every search,
 * and this page is where that becomes obvious rather than being discovered as
 * "the assistant has started saying it doesn't know things".
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Embedding & retrieval" };

export default async function RetrievalPage() {
  await requireAdmin("configure");

  const settings = await getEmbeddingSettings();
  const db = requireAdminDb();

  const [{ count: total }, { count: current }] = await Promise.all([
    db.from("chunks").select("id", { count: "exact", head: true }),
    db
      .from("chunks")
      .select("id", { count: "exact", head: true })
      .eq("model", settings.model),
  ]);

  const stale = (total ?? 0) - (current ?? 0);

  const keysPresent = {
    // Booleans only. A settings screen has no business rendering a key, and
    // "is it set" is the only thing an operator needs from one.
    openai: Boolean(process.env.OPENAI_API_KEY),
    cohere: Boolean(process.env.COHERE_API_KEY),
    google: Boolean(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY),
    voyage: Boolean(process.env.VOYAGE_API_KEY),
  };

  return (
    <>
      <PageHeader
        title="Embedding & retrieval"
        description="How text is turned into vectors, and how passages are found again."
      />

      {stale > 0 && (
        <Card>
          <p role="alert" className="text-caption text-clay">
            <strong>{stale}</strong> of {total} indexed passages were embedded by a
            different model from the active one. They will not match anything a visitor
            asks. Re-index those sources from the knowledge base.
          </p>
        </Card>
      )}

      <RetrievalForm
        values={{
          provider: settings.provider,
          model: settings.model,
          dimensions: settings.dimensions,
          chunkSize: settings.chunkSize,
          chunkOverlap: settings.chunkOverlap,
          chunkingStrategy: settings.chunkingStrategy,
          topK: settings.topK,
          similarityThreshold: settings.similarityThreshold,
          rerankerEnabled: settings.rerankerEnabled,
          rerankerProvider: settings.rerankerProvider,
          rerankerModel: settings.rerankerModel,
          rerankCandidates: settings.rerankCandidates,
        }}
        keysPresent={keysPresent}
      />
    </>
  );
}
