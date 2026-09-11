"use server";

import { revalidatePath } from "next/cache";
import { requireAdminDb } from "@/lib/ai/admin-client";
import { audit, requireAdmin } from "@/lib/admin/auth";
import { isLeadStatus } from "@/lib/admin/lead-status";

/**
 * Working a lead.
 *
 * The website form and the assistant write the same `leads` table, so this
 * screen is the firm's single list rather than one of two — which is the whole
 * reason the assistant's lead tool reuses the website's pipeline instead of
 * having a table of its own.
 *
 * The statuses themselves live in lib/admin/lead-status.ts: a "use server"
 * module may only export async functions, so a constant cannot sit beside the
 * action that validates against it.
 */

export type ActionState = { ok?: boolean; message?: string };

export async function updateLead(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin("operate");

  const id = String(formData.get("leadId") ?? "");
  const status = String(formData.get("status") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();

  if (!id) return { message: "No lead was named." };
  if (!isLeadStatus(status)) return { message: "That is not a status this list uses." };

  const { error } = await requireAdminDb()
    .from("leads")
    .update({ status, notes: notes || null })
    .eq("id", id);

  if (error) return { message: error.message };

  await audit(admin, "lead.update", id, { status });
  revalidatePath("/admin/leads");

  return { ok: true, message: "Saved." };
}
