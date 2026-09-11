import type { Metadata } from "next";
import {
  AddSourceForm,
  DocumentActions,
  TestSearch,
} from "@/components/admin/KnowledgeForms";
import { Badge, Card, Cell, Empty, PageHeader, Table } from "@/components/admin/ui";
import { requireAdminDb } from "@/lib/ai/admin-client";
import { getEmbeddingSettings } from "@/lib/ai/config";
import { requireAdmin } from "@/lib/admin/auth";
import { documentStatusLabel, when } from "@/lib/admin/labels";

/**
 * The knowledge base.
 *
 * Everything the assistant is able to say comes from this list, so the list is
 * the page: what is in it, whether it indexed, and how to try a search against
 * it. The active embedding model is stated at the top because a document
 * indexed under one model and searched under another matches nothing, and that
 * failure is otherwise completely silent.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Knowledge base" };

type DocumentRow = {
  id: string;
  title: string;
  source_type: string;
  source_url: string | null;
  status: string;
  error: string | null;
  tags: string[];
  chunk_count: number;
  created_at: string;
  updated_at: string;
};

export default async function KnowledgePage() {
  await requireAdmin("content");

  const db = requireAdminDb();

  const [{ data }, settings] = await Promise.all([
    db
      .from("documents")
      .select(
        "id, title, source_type, source_url, status, error, tags, chunk_count, created_at, updated_at",
      )
      .order("created_at", { ascending: false })
      .limit(200),
    getEmbeddingSettings().catch(() => null),
  ]);

  const documents = (data ?? []) as DocumentRow[];
  const passages = documents.reduce((total, row) => total + row.chunk_count, 0);

  return (
    <>
      <PageHeader
        title="Knowledge base"
        description="The sources the assistant answers from. It will not answer from anything else."
      />

      <Card>
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-eyebrow uppercase text-slate">Sources</dt>
            <dd className="tabular mt-1 text-h3 text-pine">{documents.length}</dd>
          </div>
          <div>
            <dt className="text-eyebrow uppercase text-slate">Passages indexed</dt>
            <dd className="tabular mt-1 text-h3 text-pine">{passages}</dd>
          </div>
          <div>
            <dt className="text-eyebrow uppercase text-slate">Embedding model</dt>
            <dd className="mt-1 text-caption text-ink">
              {settings ? (
                <>
                  {settings.provider} / {settings.model}
                  <span className="text-slate"> · {settings.dimensions} dimensions</span>
                </>
              ) : (
                "Not configured"
              )}
            </dd>
          </div>
        </dl>
      </Card>

      <AddSourceForm />

      <Card
        title="Sources"
        description="A source that failed says why. Re-index one after changing the chunking or the embedding model."
      >
        {documents.length === 0 ? (
          <Empty>
            Nothing is indexed yet, so the assistant will say it does not know almost
            everything. Start with the client brief and the brand guide.
          </Empty>
        ) : (
          <Table head={["Source", "Status", "Passages", "Added", ""]}>
            {documents.map((row) => (
              <tr key={row.id}>
                <Cell>
                  <p className="font-medium text-ink">{row.title}</p>
                  <p className="text-slate">
                    {row.source_type}
                    {row.source_url && (
                      <>
                        {" · "}
                        <a
                          href={row.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-pine underline underline-offset-2"
                        >
                          {row.source_url}
                        </a>
                      </>
                    )}
                  </p>
                  {row.tags.length > 0 && (
                    <p className="mt-1 text-slate">Tags: {row.tags.join(", ")}</p>
                  )}
                  {row.error && (
                    <p className="mt-1 max-w-md text-clay">{row.error}</p>
                  )}
                </Cell>
                <Cell>
                  <Badge tone={toneFor(row.status)}>
                    {documentStatusLabel(row.status)}
                  </Badge>
                </Cell>
                <Cell className="tabular">{row.chunk_count}</Cell>
                <Cell className="whitespace-nowrap text-slate">
                  {when(row.created_at)}
                </Cell>
                <Cell>
                  <DocumentActions documentId={row.id} />
                </Cell>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <TestSearch />
    </>
  );
}

function toneFor(status: string): "good" | "warn" | "bad" | "neutral" {
  if (status === "ready") return "good";
  if (status === "failed") return "bad";
  if (status === "processing") return "warn";
  return "neutral";
}
