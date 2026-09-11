"use server";

import { revalidatePath } from "next/cache";
import { requireAdminDb } from "@/lib/ai/admin-client";
import { audit, requireAdmin } from "@/lib/admin/auth";
import { retentionSettings, writeSetting } from "@/lib/admin/settings";

/**
 * Rate limiting, retention, and the purge.
 *
 * The purge is a button rather than a schedule. Deleting a client's records on
 * a timer is a decision the firm should make deliberately, and
 * supabase/assistant-settings.sql carries the exact pg_cron line for when they
 * do — with the reason it is not already there.
 */

export type ActionState = { ok?: boolean; message?: string };

export async function saveRateLimit(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin("configure");

  const windowSeconds = Number(formData.get("windowSeconds") ?? 60);
  const max = Number(formData.get("max") ?? 12);

  if (!Number.isFinite(windowSeconds) || windowSeconds < 10 || windowSeconds > 3600) {
    return { message: "The window has to be between 10 seconds and an hour." };
  }

  if (!Number.isFinite(max) || max < 1 || max > 500) {
    return { message: "The limit has to be between 1 and 500 messages." };
  }

  try {
    await writeSetting(
      "rate_limit",
      { windowSeconds: Math.trunc(windowSeconds), max: Math.trunc(max) },
      admin.id,
    );
  } catch (error) {
    return { message: error instanceof Error ? error.message : "Could not save that." };
  }

  await audit(admin, "settings.rate_limit", undefined, { windowSeconds, max });
  revalidatePath("/admin/settings");

  return { ok: true, message: "Saved." };
}

export async function saveRetention(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin("configure");

  const days = Number(formData.get("conversationDays") ?? 0);

  if (!Number.isFinite(days) || days < 0 || days > 3650) {
    return { message: "Use a number of days between 0 and 3650. Zero keeps everything." };
  }

  try {
    await writeSetting("retention", { conversationDays: Math.trunc(days) }, admin.id);
  } catch (error) {
    return { message: error instanceof Error ? error.message : "Could not save that." };
  }

  await audit(admin, "settings.retention", undefined, { days });
  revalidatePath("/admin/settings");

  return {
    ok: true,
    message:
      days === 0
        ? "Saved. Nothing will be deleted."
        : `Saved. Use the purge below to apply it — nothing is deleted automatically.`,
  };
}

export async function purgeNow(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin("configure");

  if (formData.get("confirm") !== "yes") {
    return { message: "Tick the confirmation. Deleted transcripts cannot be recovered." };
  }

  const { conversationDays } = await retentionSettings();

  if (conversationDays <= 0) {
    return { message: "The retention period is zero, which means keep everything." };
  }

  const { data, error } = await requireAdminDb().rpc("purge_old_conversations", {
    p_days: conversationDays,
  });

  if (error) return { message: error.message };

  const removed = Number(data ?? 0);

  await audit(admin, "settings.purge", `${removed} conversations`, { conversationDays });
  revalidatePath("/admin/settings");

  return {
    ok: true,
    message:
      removed === 0
        ? "Nothing was old enough to delete."
        : `Deleted ${removed} closed conversations and their messages. Leads were not touched.`,
  };
}
