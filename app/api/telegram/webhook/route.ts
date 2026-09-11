import { isAssistantConfigured } from "@/lib/ai/admin-client";
import { getChannelSettings } from "@/lib/ai/config";
import { runTurn } from "@/lib/ai/engine";
import { closeConversations, latestConversationId } from "@/lib/ai/memory";
import {
  EDIT_INTERVAL_MS,
  answerCallback,
  editMessage,
  isTelegramConfigured,
  sendMessage,
  sendTyping,
  type InlineButton,
} from "@/lib/ai/telegram";
import { assistant, company } from "@/lib/content";

/**
 * Telegram, as a transport over the same engine.
 *
 * Everything the assistant knows and every rule it follows is behind runTurn,
 * exactly as it is for the web. What is left here is Telegram's shape: a secret
 * header to verify, three commands, inline buttons, and an answer delivered by
 * editing one message instead of streaming into a socket.
 *
 * Telegram retries any update it does not get a 200 for, and a retry would
 * answer the same question twice. So this returns 200 for everything it has
 * seen, including the updates it deliberately ignores, and reports real
 * failures in the log rather than in the status code.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Update = {
  message?: {
    chat?: { id?: number };
    from?: { id?: number; first_name?: string; username?: string };
    text?: string;
  };
  callback_query?: {
    id?: string;
    data?: string;
    from?: { id?: number; first_name?: string };
    message?: { chat?: { id?: number } };
  };
};

export async function POST(request: Request): Promise<Response> {
  // Telegram sends the secret back on every update. Without this check the
  // webhook is a public endpoint that will talk to anybody who finds the URL.
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || "";
  const presented = request.headers.get("x-telegram-bot-api-secret-token") || "";

  if (!secret || presented !== secret) {
    return new Response("Not found", { status: 404 });
  }

  if (!isTelegramConfigured() || !isAssistantConfigured()) {
    return ok();
  }

  let update: Update;
  try {
    update = (await request.json()) as Update;
  } catch {
    return ok();
  }

  try {
    if (update.callback_query) {
      await handleCallback(update.callback_query);
    } else if (update.message) {
      await handleMessage(update.message);
    }
  } catch (error) {
    console.error("[arkan] Telegram update failed:", error);
  }

  return ok();
}

async function handleMessage(message: NonNullable<Update["message"]>): Promise<void> {
  const chatId = message.chat?.id;
  const text = (message.text ?? "").trim();

  if (!chatId || !text) return;

  const settings = await getChannelSettings("telegram");

  if (!settings.enabled) {
    await sendMessage(chatId, assistant.offline);
    return;
  }

  if (text.startsWith("/")) {
    await handleCommand(chatId, text, settings.welcomeMessage, settings.quickReplies);
    return;
  }

  await answer(chatId, text);
}

async function handleCommand(
  chatId: number,
  text: string,
  welcome: string | null,
  quickReplies: string[],
): Promise<void> {
  const command = text.split(/[\s@]/)[0].toLowerCase();

  if (command === "/start") {
    await sendMessage(
      chatId,
      welcome ??
        `${assistant.intro}\n\n${assistant.disclaimer}`,
      { buttons: starterButtons(quickReplies) },
    );
    return;
  }

  if (command === "/help") {
    await sendMessage(
      chatId,
      [
        `What I can help with: Arkan's services, the four pillars, how an ` +
          `engagement runs, and how to reach the team.`,
        "",
        "/start — the starter questions again",
        "/reset — begin a new conversation",
        "",
        `To speak to a person, just ask. Email ${company.email} or call ${company.phone}.`,
      ].join("\n"),
    );
    return;
  }

  if (command === "/reset") {
    await closeConversations("telegram", String(chatId));
    await sendMessage(chatId, "Done — this is a fresh conversation.", {
      buttons: starterButtons(quickReplies),
    });
    return;
  }

  await sendMessage(chatId, "I don't know that command. Try /help.");
}

async function handleCallback(
  callback: NonNullable<Update["callback_query"]>,
): Promise<void> {
  const chatId = callback.message?.chat?.id;
  const data = callback.data ?? "";

  // Acknowledged first and always: an unanswered callback leaves a spinner on
  // the visitor's button until Telegram times it out.
  if (callback.id) await answerCallback(callback.id);

  if (!chatId || !data.startsWith("q:")) return;

  const settings = await getChannelSettings("telegram");
  const starters = settings.quickReplies.length
    ? settings.quickReplies
    : [...assistant.starters];

  const question = starters[Number(data.slice(2))];
  if (!question) return;

  // Echoed back so the thread reads as a conversation rather than an answer to
  // a question nobody can see.
  await sendMessage(chatId, question);
  await answer(chatId, question);
}

/**
 * One turn, delivered as an edited message.
 *
 * A placeholder goes out first so the visitor sees something within a second,
 * then it is edited as the answer grows — throttled, because Telegram limits
 * edits per chat and a per-token edit would be rate-limited inside one answer.
 */
async function answer(chatId: number, question: string): Promise<void> {
  await sendTyping(chatId);

  const conversationId = await latestConversationId("telegram", String(chatId));

  let messageId: number | null = null;
  let text = "";
  let lastEdit = 0;
  let failure: string | null = null;
  let handoff: string | null = null;

  for await (const event of runTurn({
    channel: "telegram",
    externalUserId: String(chatId),
    message: question,
    conversationId,
  })) {
    if (event.type === "delta") {
      text += event.text;

      if (!messageId) {
        messageId = await sendMessage(chatId, text);
        lastEdit = Date.now();
        continue;
      }

      if (Date.now() - lastEdit >= EDIT_INTERVAL_MS) {
        await editMessage(chatId, messageId, text);
        lastEdit = Date.now();
      }
    } else if (event.type === "tool" && event.state === "running") {
      await sendTyping(chatId);
    } else if (event.type === "handoff") {
      handoff = event.reason;
    } else if (event.type === "error") {
      failure = event.message;
    }
  }

  // The last edit is unconditional. Without it the throttle would leave the
  // final sentence or two of every answer unsent.
  if (messageId && text) {
    await editMessage(chatId, messageId, text);
  } else if (text) {
    await sendMessage(chatId, text);
  }

  if (handoff) {
    await sendMessage(
      chatId,
      `A colleague has been notified and will follow up. You can also reach the team at ${company.email}.`,
    );
  }

  if (failure) await sendMessage(chatId, failure);
}

function starterButtons(quickReplies: string[]): InlineButton[] {
  const starters = quickReplies.length ? quickReplies : [...assistant.starters];

  // callback_data is capped at 64 bytes, so the index travels rather than the
  // question. The button's visible text is the question itself.
  return starters.slice(0, 6).map((text, index) => ({
    text: text.length > 60 ? `${text.slice(0, 57)}…` : text,
    callback_data: `q:${index}`,
  }));
}

function ok(): Response {
  return new Response("ok", { status: 200 });
}
