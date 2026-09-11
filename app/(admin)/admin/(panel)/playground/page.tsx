import type { Metadata } from "next";
import { Playground } from "@/components/admin/Playground";
import { PageHeader } from "@/components/admin/ui";
import {
  getCatalog,
  groupByProvider,
  isUsableForChat,
  type CatalogModel,
} from "@/lib/ai/catalog";
import { requireAdmin } from "@/lib/admin/auth";

/**
 * Trying changes before they reach a visitor.
 *
 * The screen to open after editing the persona or uploading a source, and
 * before deciding a model is too expensive: it shows the answer, the passages
 * behind it, the tokens and the cost, and it writes nothing down.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Playground" };

export default async function PlaygroundPage() {
  await requireAdmin("content");

  const catalog = await getCatalog().catch(() => [] as CatalogModel[]);

  const options = groupByProvider(catalog.filter(isUsableForChat)).map((group) => ({
    provider: group.provider,
    models: group.models.map((model) => ({
      id: model.id,
      name: model.name,
      provider: model.provider,
      contextLength: model.contextLength,
      promptPrice: model.promptPrice,
      completionPrice: model.completionPrice,
    })),
  }));

  return (
    <>
      <PageHeader
        title="Playground"
        description="Ask a question the way a visitor would, and see everything that went into the answer."
      />

      <Playground options={options} />
    </>
  );
}
