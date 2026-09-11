"use server";

import { revalidatePath } from "next/cache";
import { requireAdminDb } from "@/lib/ai/admin-client";
import { getCatalog } from "@/lib/ai/catalog";
import { invalidateConfigCache } from "@/lib/ai/config";
import { channels, type Channel } from "@/lib/ai/types";
import { audit, requireAdmin } from "@/lib/admin/auth";

/**
 * Everything an operator can change about how the assistant behaves.
 *
 * Two rules hold across all of it:
 *
 *   1. The cache is dropped after every write. Settings are cached for a few
 *      seconds on the hot path, and an operator who changes a temperature and
 *      sees the old value in the playground concludes the panel is broken.
 *   2. Every change is written to the audit log with the values it set. "Who
 *      turned the reranker off" is a question that gets asked three weeks later.
 */

export type ActionState = { ok?: boolean; message?: string };

// ── Generation model ────────────────────────────────────────────────────────

export async function saveModelConfig(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin("configure");

  const channel = readChannel(formData.get("channel"));
  const activeModel = text(formData.get("activeModel"));
  const fallbackModel = text(formData.get("fallbackModel"));

  const temperature = number(formData.get("temperature"), 0.3, 0, 2);
  const maxTokens = Math.trunc(number(formData.get("maxTokens"), 1024, 1, 32_000));
  const topP = number(formData.get("topP"), 1, 0, 1);
  const budget = text(formData.get("monthlyBudgetUsd"));

  let schedule: unknown = [];
  const rawSchedule = text(formData.get("schedule"));

  if (rawSchedule) {
    try {
      schedule = JSON.parse(rawSchedule);
      if (!Array.isArray(schedule)) throw new Error("not a list");
    } catch {
      return {
        message:
          "The schedule must be a JSON list, for example: " +
          '[{"days":[1,2,3,4,5],"from":"09:00","to":"17:00","model":"…"}]',
      };
    }
  }

  const row = {
    channel,
    provider: "openrouter",
    active_model: activeModel || null,
    fallback_model: fallbackModel || null,
    temperature,
    max_tokens: maxTokens,
    top_p: topP,
    schedule,
    monthly_budget_usd: budget ? Number(budget) : null,
    updated_at: new Date().toISOString(),
  };

  const db = requireAdminDb();

  // Two partial unique indexes rather than one nullable unique column, so the
  // default row cannot be duplicated. That means upsert cannot be used for it;
  // the default is found by "channel is null" instead.
  const existing = await db
    .from("model_config")
    .select("id")
    .filter("channel", channel === null ? "is" : "eq", channel)
    .maybeSingle();

  const id = (existing.data as { id?: string } | null)?.id;

  const { error } = id
    ? await db.from("model_config").update(row).eq("id", id)
    : await db.from("model_config").insert(row);

  if (error) return { message: error.message };

  invalidateConfigCache();
  await audit(admin, "model.update", channel ?? "default", { activeModel, temperature, maxTokens });
  revalidatePath("/admin/models");

  return { ok: true, message: "Saved. New conversations use it immediately." };
}

export async function clearChannelModel(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin("configure");
  const channel = readChannel(formData.get("channel"));

  if (channel === null) {
    return { message: "The default cannot be removed — every channel falls back to it." };
  }

  const { error } = await requireAdminDb()
    .from("model_config")
    .delete()
    .eq("channel", channel);

  if (error) return { message: error.message };

  invalidateConfigCache();
  await audit(admin, "model.clear", channel);
  revalidatePath("/admin/models");

  return { ok: true, message: `${channel} now uses the default again.` };
}

export async function refreshCatalog(): Promise<void> {
  await requireAdmin("configure");
  await getCatalog({ force: true });
  revalidatePath("/admin/models");
}

// ── Embedding and retrieval ─────────────────────────────────────────────────

export async function saveEmbeddingConfig(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin("configure");
  const db = requireAdminDb();

  const { data: current } = await db
    .from("embedding_config")
    .select("*")
    .eq("is_active", true)
    .maybeSingle();

  const active = current as Record<string, unknown> | null;
  if (!active) return { message: "There is no active embedding configuration to change." };

  const provider = text(formData.get("provider")) || String(active.provider);
  const model = text(formData.get("model")) || String(active.model);
  const dimensions = Math.trunc(number(formData.get("dimensions"), Number(active.dimensions), 8, 4096));

  const changingIndex =
    provider !== active.provider ||
    model !== active.model ||
    dimensions !== Number(active.dimensions);

  // Changing the model without re-indexing leaves the knowledge base full of
  // vectors from a different model, and they match nothing. The failure is
  // silent — the search runs, it just returns nothing useful — so the change
  // requires an explicit acknowledgement rather than a warning nobody reads.
  if (changingIndex && formData.get("acknowledged") !== "yes") {
    return {
      message:
        "Changing the embedding model or its dimensions makes every indexed " +
        "passage unmatchable until the whole knowledge base is re-indexed. " +
        "Tick the box to confirm you will re-index.",
    };
  }

  if (dimensions !== 1536) {
    return {
      message:
        "The `chunks.embedding` column is fixed at 1536 dimensions, so this " +
        "cannot be changed from the panel. See the migration path documented " +
        "in supabase/assistant.sql: add a column, backfill it, cut over.",
    };
  }

  const row = {
    provider,
    model,
    dimensions,
    chunk_size: Math.trunc(number(formData.get("chunkSize"), 500, 100, 4000)),
    chunk_overlap: Math.trunc(number(formData.get("chunkOverlap"), 50, 0, 1000)),
    chunking_strategy: text(formData.get("chunkingStrategy")) || "recursive",
    top_k: Math.trunc(number(formData.get("topK"), 6, 1, 50)),
    similarity_threshold: number(formData.get("similarityThreshold"), 0.3, 0, 1),
    reranker_enabled: formData.get("rerankerEnabled") === "on",
    reranker_provider: text(formData.get("rerankerProvider")) || null,
    reranker_model: text(formData.get("rerankerModel")) || null,
    rerank_candidates: Math.trunc(number(formData.get("rerankCandidates"), 24, 1, 200)),
    updated_at: new Date().toISOString(),
  };

  if (row.chunk_overlap >= row.chunk_size) {
    return { message: "The overlap has to be smaller than the chunk size." };
  }

  const { error } = await db
    .from("embedding_config")
    .update(row)
    .eq("id", active.id as string);

  if (error) return { message: error.message };

  invalidateConfigCache();
  await audit(admin, "embedding.update", model, { provider, model, changingIndex });
  revalidatePath("/admin/retrieval");

  return {
    ok: true,
    message: changingIndex
      ? "Saved. Re-index every source before trusting an answer."
      : "Saved. Retrieval settings apply to the next question asked.",
  };
}

// ── Persona and system prompt ───────────────────────────────────────────────

export async function savePrompt(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin("content");

  const content = String(formData.get("content") ?? "").trim();
  const persona = text(formData.get("persona"));
  const label = text(formData.get("label")) || `Edited ${new Date().toISOString().slice(0, 10)}`;

  if (content.length < 50) {
    return { message: "That is too short to be a system prompt. Nothing was saved." };
  }

  const db = requireAdminDb();

  // A new row every time, never an edit in place. Rollback is then "activate
  // version 4", which is a click, rather than "find the old text", which is a
  // conversation about who has a copy.
  const { error: deactivate } = await db
    .from("prompt_versions")
    .update({ is_active: false })
    .eq("is_active", true);

  if (deactivate) return { message: deactivate.message };

  const { error } = await db.from("prompt_versions").insert({
    label,
    content,
    persona,
    is_active: true,
    created_by: admin.id,
  });

  if (error) return { message: error.message };

  invalidateConfigCache();
  await audit(admin, "prompt.publish", label);
  revalidatePath("/admin/persona");

  return { ok: true, message: "Published. The next question uses it." };
}

export async function activatePrompt(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin("content");
  const id = String(formData.get("versionId") ?? "");

  if (!id) return { message: "No version was named." };

  const db = requireAdminDb();

  await db.from("prompt_versions").update({ is_active: false }).eq("is_active", true);

  const { error } = await db
    .from("prompt_versions")
    .update({ is_active: true })
    .eq("id", id);

  if (error) return { message: error.message };

  invalidateConfigCache();
  await audit(admin, "prompt.rollback", id);
  revalidatePath("/admin/persona");

  return { ok: true, message: "That version is live again." };
}

// ── Channels ────────────────────────────────────────────────────────────────

export async function saveChannelSettings(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin("configure");

  const channel = readChannel(formData.get("channel"));
  if (channel === null) return { message: "No channel was named." };

  const quickReplies = String(formData.get("quickReplies") ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);

  const allowedDomains = String(formData.get("allowedDomains") ?? "")
    .split(/[\n,]/)
    .map((line) => line.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
    .filter(Boolean);

  const accent = text(formData.get("accent"));

  if (accent && !/^#[0-9a-fA-F]{3,8}$/.test(accent)) {
    return { message: "The accent has to be a hex colour, like #143A32." };
  }

  const row = {
    channel,
    enabled: formData.get("enabled") === "on",
    welcome_message: text(formData.get("welcomeMessage")) || null,
    quick_replies: quickReplies,
    appearance:
      channel === "widget"
        ? {
            accent: accent || "#143A32",
            position: formData.get("position") === "left" ? "left" : "right",
            launcherLabel: text(formData.get("launcherLabel")) || null,
          }
        : {},
    allowed_domains: channel === "widget" ? allowedDomains : [],
    updated_at: new Date().toISOString(),
  };

  const { error } = await requireAdminDb()
    .from("channel_settings")
    .upsert(row, { onConflict: "channel" });

  if (error) return { message: error.message };

  invalidateConfigCache();
  await audit(admin, "channel.update", channel, { enabled: row.enabled });
  revalidatePath("/admin/channels");

  return { ok: true, message: "Saved." };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function readChannel(value: FormDataEntryValue | null): Channel | null {
  const raw = typeof value === "string" ? value : "";
  return (channels as readonly string[]).includes(raw) ? (raw as Channel) : null;
}

function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function number(
  value: FormDataEntryValue | null,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(typeof value === "string" ? value : NaN);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
