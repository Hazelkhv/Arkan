"use server";

import { revalidatePath } from "next/cache";
import { requireAdminDb } from "@/lib/ai/admin-client";
import {
  deleteWebhook,
  getMe,
  isTelegramConfigured,
  sendMessage,
  setWebhook,
} from "@/lib/ai/telegram";
import { audit, requireAdmin } from "@/lib/admin/auth";

/**
 * Telegram setup and broadcast.
 *
 * The webhook secret is not generated here and not editable here: it lives in
 * TELEGRAM_WEBHOOK_SECRET, and the webhook route refuses any update that does
 * not present it. Putting it in the database would mean an operator could
 * change it in one place and leave the running function checking the old value,
 * which fails as silently as a bot that has simply stopped answering.
 */

export type ActionState = { ok?: boolean; message?: string };

export async function registerWebhook(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin("configure");

  if (!isTelegramConfigured()) {
    return { message: "TELEGRAM_BOT_TOKEN is not set, so there is no bot to point anywhere." };
  }

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || "";

  if (!secret) {
    return {
      message:
        "TELEGRAM_WEBHOOK_SECRET is not set. Without it the webhook would be a " +
        "public endpoint that answers anybody who finds the URL, so it is not " +
        "registered until that variable exists.",
    };
  }

  const base = String(formData.get("baseUrl") ?? "").trim().replace(/\/+$/, "");

  if (!/^https:\/\//.test(base)) {
    return { message: "Telegram only delivers to an https address." };
  }

  const ok = await setWebhook(`${base}/api/telegram/webhook`, secret);

  if (!ok) return { message: "Telegram refused the webhook. The server log has its reason." };

  await audit(admin, "telegram.webhook.set", base);
  revalidatePath("/admin/channels");

  return { ok: true, message: "Registered. Send the bot /start to check it." };
}

export async function unregisterWebhook(): Promise<void> {
  const admin = await requireAdmin("configure");
  await deleteWebhook();
  await audit(admin, "telegram.webhook.delete");
  revalidatePath("/admin/channels");
}

/**
 * A message to every visitor who has used the Telegram bot.
 *
 * Paced rather than fired in parallel: Telegram limits a bot to roughly thirty
 * messages a second across all chats, and exceeding it does not queue the
 * excess — it returns 429s and, repeated, gets the bot limited for longer.
 *
 * Capped at a thousand recipients per run. Beyond that this needs to be a
 * background job rather than a form submission, and pretending otherwise would
 * mean a broadcast that silently stops halfway through a serverless timeout.
 */
const BROADCAST_CAP = 1000;
const BROADCAST_PACE_MS = 40;

export async function sendBroadcast(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin("configure");

  const body = String(formData.get("body") ?? "").trim();

  if (!body) return { message: "Write the message first." };
  if (formData.get("confirm") !== "yes") {
    return { message: "Tick the confirmation: this goes to everyone at once." };
  }
  if (!isTelegramConfigured()) {
    return { message: "TELEGRAM_BOT_TOKEN is not set." };
  }

  const db = requireAdminDb();

  const { data } = await db
    .from("unified_users")
    .select("external_id")
    .eq("channel", "telegram")
    .limit(BROADCAST_CAP);

  const recipients = ((data ?? []) as { external_id: string }[]).map((row) => row.external_id);

  if (recipients.length === 0) {
    return { message: "Nobody has used the Telegram bot yet." };
  }

  const { data: created } = await db
    .from("broadcasts")
    .insert({
      channel: "telegram",
      body,
      status: "sending",
      created_by: admin.id,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();

  const broadcastId = (created as { id?: string } | null)?.id;

  let sent = 0;
  let failed = 0;

  for (const chatId of recipients) {
    const messageId = await sendMessage(chatId, body);
    if (messageId === null) failed += 1;
    else sent += 1;

    await new Promise((resolve) => setTimeout(resolve, BROADCAST_PACE_MS));
  }

  if (broadcastId) {
    await db
      .from("broadcasts")
      .update({
        status: failed === recipients.length ? "failed" : "sent",
        sent_count: sent,
        failed_count: failed,
        finished_at: new Date().toISOString(),
      })
      .eq("id", broadcastId);
  }

  await audit(admin, "telegram.broadcast", broadcastId ?? "", { sent, failed });
  revalidatePath("/admin/channels");

  return {
    ok: sent > 0,
    message:
      failed === 0
        ? `Sent to ${sent} people.`
        : `Sent to ${sent}. ${failed} could not be delivered — usually people who have blocked the bot.`,
  };
}

export async function checkBot(): Promise<void> {
  await requireAdmin("configure");
  await getMe();
  revalidatePath("/admin/channels");
}
