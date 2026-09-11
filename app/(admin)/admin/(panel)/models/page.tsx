import type { Metadata } from "next";
import { ModelForm, type ModelOption } from "@/components/admin/ModelForm";
import { Card, PageHeader, secondaryButtonClass } from "@/components/admin/ui";
import { requireAdminDb } from "@/lib/ai/admin-client";
import {
  getCatalog,
  groupByProvider,
  isUsableForChat,
  resolveDefaultModel,
  type CatalogModel,
} from "@/lib/ai/catalog";
import { channels, type Channel } from "@/lib/ai/types";
import { requireAdmin } from "@/lib/admin/auth";
import { refreshCatalog } from "@/lib/admin/actions/config";

/**
 * Which model answers, per channel.
 *
 * The picker is built from OpenRouter's live catalog at request time. That is
 * the point of routing every model through one provider: switching is a slug,
 * and the list of slugs is fetched rather than remembered, so it stays correct
 * as models are added and retired without anybody editing this file.
 *
 * Only tool-capable models are offered. Capturing a lead and handing over to a
 * person are both tool calls, and they are the two things the assistant exists
 * to do — a model that cannot make them would look like it was working right up
 * until the moment that mattered.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Response model" };

export default async function ModelsPage() {
  await requireAdmin("configure");

  const db = requireAdminDb();

  const [{ data }, catalog] = await Promise.all([
    db.from("model_config").select("*"),
    getCatalog().catch(() => [] as CatalogModel[]),
  ]);

  const rows = (data ?? []) as Record<string, unknown>[];
  const usable = catalog.filter(isUsableForChat);
  const options = groupByProvider(usable).map((group) => ({
    provider: group.provider,
    models: group.models.map(toOption),
  }));

  const resolved = resolveDefaultModel(catalog)?.id ?? null;
  const defaults = rows.find((row) => row.channel === null);

  return (
    <>
      <PageHeader
        title="Response model"
        description="Every model is reached through one OpenRouter key, so changing which one answers is a single setting and never a deploy."
        actions={
          <form action={refreshCatalog}>
            <button type="submit" className={`${secondaryButtonClass} text-caption`}>
              Refresh the catalog
            </button>
          </form>
        }
      />

      <Card>
        <p className="text-caption text-slate">
          {catalog.length > 0 ? (
            <>
              <span className="tabular font-semibold text-ink">{usable.length}</span> of{" "}
              <span className="tabular">{catalog.length}</span> catalogued models can run
              a turn here — the rest cannot call tools, or are batch and free variants
              that are not suitable in front of a visitor. The catalog is cached for an
              hour.
            </>
          ) : (
            "The OpenRouter catalog could not be reached, so only a model already saved can be used. Check OPENROUTER_API_KEY and the network, then refresh."
          )}
        </p>
      </Card>

      <ModelForm
        values={toValues(defaults, null)}
        options={options}
        resolved={resolved}
      />

      <div className="grid gap-6">
        {channels.map((channel) => {
          const row = rows.find((entry) => entry.channel === channel);

          return (
            <ModelForm
              key={channel}
              values={toValues(row ?? defaults, channel)}
              options={options}
              resolved={resolved}
              inherited={!row}
            />
          );
        })}
      </div>
    </>
  );
}

function toOption(model: CatalogModel): ModelOption {
  return {
    id: model.id,
    name: model.name,
    provider: model.provider,
    contextLength: model.contextLength,
    promptPrice: model.promptPrice,
    completionPrice: model.completionPrice,
  };
}

function toValues(row: Record<string, unknown> | undefined, channel: Channel | null) {
  return {
    channel,
    activeModel: (row?.active_model as string | null) ?? null,
    fallbackModel: (row?.fallback_model as string | null) ?? null,
    temperature: Number(row?.temperature ?? 0.3),
    maxTokens: Number(row?.max_tokens ?? 1024),
    topP: Number(row?.top_p ?? 1),
    schedule: Array.isArray(row?.schedule) ? (row.schedule as unknown[]) : [],
    monthlyBudgetUsd:
      row?.monthly_budget_usd === null || row?.monthly_budget_usd === undefined
        ? null
        : Number(row.monthly_budget_usd),
  };
}
