"use server";

import { revalidatePath } from "next/cache";
import { requireAdminDb } from "@/lib/ai/admin-client";
import { sendMessage } from "@/lib/ai/telegram";
import { audit, requireAdmin } from "@/lib/admin/auth";

/**
 * Taking a conversation over, and giving it back.
 *
 * While a conversation is `human_active` the engine does not answer it at all —
 * see runTurn. That is the whole mechanism: there is no "pause the bot" flag to
 * get out of step with, only the status on the conversation, and both the
 * engine and this screen read the same one.
 *
 * How an operator's reply reaches the visitor differs by channel, and that
 * difference lives here rather than anywhere else:
 *
 *   - Telegram is a push. The message is sent.
 *   - The web channels have no socket to push down. The message is stored, and
 *     the chat panel — which polls while it knows a person is replying — picks
 *     it up within a few seconds. Polling only during a takeover keeps the cost
 *     of it near zero, and it needs no read policy on `messages`, which is what
 *     a Realtime subscription would have required.
 */

export type ActionState = { ok?: boolean; message?: string };

export async function takeOver(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin("operate");
  const id = String(formData.get("conversationId") ?? "");
  if (!id) return { message: "No conversation was named." };

  const { error } = await requireAdminDb()
    .from("conversations")
    .update({
      status: "human_active",
      assigned_to: admin.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { message: error.message };

  await audit(admin, "conversation.takeover", id);
  revalidatePath("/admin/handoff");
  revalidatePath(`/admin/inbox/${id}`);

  return { ok: true, message: "You are answering this conversation. The bot is quiet." };
}

export async function returnToBot(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin("operate");
  const id = String(formData.get("conversationId") ?? "");
  if (!id) return { message: "No conversation was named." };

  const { error } = await requireAdminDb()
    .from("conversations")
    .update({
      status: "active",
      assigned_to: null,
      handoff_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { message: error.message };

  await audit(admin, "conversation.return", id);
  revalidatePath("/admin/handoff");
  revalidatePath(`/admin/inbox/${id}`);

  return { ok: true, message: "The assistant is answering again." };
}

export async function closeConversation(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin("operate");
  const id = String(formData.get("conversationId") ?? "");
  if (!id) return { message: "No conversation was named." };

  const { error } = await requireAdminDb()
    .from("conversations")
    .update({ status: "closed", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { message: error.message };

  await audit(admin, "conversation.close", id);
  revalidatePath("/admin/inbox");

  return { ok: true, message: "Closed." };
}

export async function replyAsOperator(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin("operate");

  const id = String(formData.get("conversationId") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (!id) return { message: "No conversation was named." };
  if (!body) return { message: "Write something first." };

  const db = requireAdminDb();

  const { data } = await db
    .from("conversations")
    .select("id, channel, status, user_id")
    .eq("id", id)
    .maybeSingle();

  const conversation = data as
    | { channel: string; status: string; user_id: string | null }
    | null;

  if (!conversation) return { message: "That conversation no longer exists." };

  // `provider: "operator"` is what marks this as a person rather than the
  // model. The visitor's panel reads it and labels the message "Arkan team":
  // letting a human reply wear the assistant's name would be a small lie told
  // at exactly the moment somebody asked to speak to a person.
  const { error } = await db.from("messages").insert({
    conversation_id: id,
    role: "assistant",
    content: body,
    provider: "operator",
  });

  if (error) return { message: error.message };

  await db.rpc("bump_conversation", { p_conversation: id, p_added: 1 });

  if (conversation.channel === "telegram") {
    const { data: user } = await db
      .from("unified_users")
      .select("external_id")
      .eq("id", conversation.user_id ?? "")
      .maybeSingle();

    const chatId = (user as { external_id?: string } | null)?.external_id;

    if (chatId) {
      const sent = await sendMessage(chatId, body);

      if (sent === null) {
        // Stored but not delivered. Saying so is the difference between an
        // operator who follows up and one who thinks they already have.
        return {
          message:
            "Saved to the transcript, but Telegram would not deliver it. Check the bot token.",
        };
      }
    }
  }

  await audit(admin, "conversation.reply", id);
  revalidatePath(`/admin/inbox/${id}`);

  return { ok: true, message: "Sent." };
}

export async function flagConversation(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin("read");
  const id = String(formData.get("conversationId") ?? "");
  const flagged = formData.get("flagged") === "yes";

  if (!id) return { message: "No conversation was named." };

  const { error } = await requireAdminDb()
    .from("conversations")
    .update({ flagged })
    .eq("id", id);

  if (error) return { message: error.message };

  await audit(admin, flagged ? "conversation.flag" : "conversation.unflag", id);
  revalidatePath(`/admin/inbox/${id}`);
  revalidatePath("/admin/feedback");

  return { ok: true, message: flagged ? "Flagged for review." : "Unflagged." };
}
