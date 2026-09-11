/**
 * The Telegram Bot API, and the two conversions it needs.
 *
 * Telegram is the channel that differs most from a browser, and every
 * difference is here rather than in the engine:
 *
 *   - There is no stream. A "streamed" answer is a message that is sent once
 *     and then edited as the text grows. Telegram rate-limits edits per chat,
 *     so they are throttled; editing on every token would get the bot limited
 *     within one answer.
 *   - There is no Markdown, not the kind a model writes. Telegram's MarkdownV2
 *     requires escaping a dozen characters and fails the whole message if one
 *     is missed. HTML mode needs three escapes and cannot half-fail, so the
 *     text is escaped first and the formatting is added afterwards — which also
 *     means no text from a model can ever become a tag.
 */

const API = "https://api.telegram.org/bot";

/** Telegram rejects a message over 4096 characters outright. */
const MAX_MESSAGE = 4000;

/** Comfortably inside Telegram's roughly one-edit-per-second per chat. */
export const EDIT_INTERVAL_MS = 1500;

export function telegramToken(): string | null {
  // `||`, not `??`: a blank line in .env means "not configured".
  return process.env.TELEGRAM_BOT_TOKEN || null;
}

export function isTelegramConfigured(): boolean {
  return telegramToken() !== null;
}

async function call<T>(method: string, payload: unknown): Promise<T | null> {
  const token = telegramToken();
  if (!token) return null;

  try {
    const response = await fetch(`${API}${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });

    const body = (await response.json()) as {
      ok?: boolean;
      result?: T;
      description?: string;
    };

    // Telegram answers HTTP 200 with ok:false for most failures, so the status
    // code alone would report a rejected send as a successful one.
    if (!body.ok) {
      console.error(`[arkan] Telegram ${method} failed: ${body.description}`);
      return null;
    }

    return body.result ?? null;
  } catch (error) {
    console.error(`[arkan] Telegram ${method} threw:`, error);
    return null;
  }
}

export type InlineButton = { text: string; callback_data: string };

export async function sendMessage(
  chatId: number | string,
  text: string,
  options: { buttons?: InlineButton[]; disablePreview?: boolean } = {},
): Promise<number | null> {
  const result = await call<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text: toTelegramHtml(text),
    parse_mode: "HTML",
    link_preview_options: { is_disabled: options.disablePreview !== false },
    ...(options.buttons && options.buttons.length > 0
      ? { reply_markup: { inline_keyboard: options.buttons.map((b) => [b]) } }
      : {}),
  });

  return result?.message_id ?? null;
}

export async function editMessage(
  chatId: number | string,
  messageId: number,
  text: string,
): Promise<void> {
  await call("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: toTelegramHtml(text),
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });
}

/** The "typing…" indicator. Lasts about five seconds, or until a message. */
export async function sendTyping(chatId: number | string): Promise<void> {
  await call("sendChatAction", { chat_id: chatId, action: "typing" });
}

export async function answerCallback(
  callbackId: string,
  text?: string,
): Promise<void> {
  await call("answerCallbackQuery", { callback_query_id: callbackId, text });
}

export async function setWebhook(
  url: string,
  secret: string,
): Promise<boolean> {
  const result = await call<boolean>("setWebhook", {
    url,
    secret_token: secret,
    // Only what the bot acts on. Anything else is bandwidth and a wake-up for
    // a serverless function that will do nothing with it.
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });

  return result === true;
}

export async function deleteWebhook(): Promise<boolean> {
  return (await call<boolean>("deleteWebhook", { drop_pending_updates: false })) === true;
}

export type WebhookInfo = {
  url?: string;
  has_custom_certificate?: boolean;
  pending_update_count?: number;
  last_error_date?: number;
  last_error_message?: string;
};

export async function getWebhookInfo(): Promise<WebhookInfo | null> {
  return call<WebhookInfo>("getWebhookInfo", {});
}

export type BotInfo = { id: number; username?: string; first_name?: string };

export async function getMe(): Promise<BotInfo | null> {
  return call<BotInfo>("getMe", {});
}

/**
 * Markdown as a model writes it, turned into the small subset Telegram renders.
 *
 * The escape happens first, on the whole string, so the tags added afterwards
 * are the only tags in the result. Doing it the other way round — formatting
 * then escaping — is how a knowledge base containing "<script>" ends up as
 * markup in a chat message.
 */
export function toTelegramHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const formatted = escaped
    .replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|\s)\*([^*\n]+)\*(?=\s|$)/g, "$1<i>$2</i>")
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(
      /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2">$1</a>',
    )
    // A heading inside a chat message is noise; keep the words, drop the hashes.
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "• ");

  return truncate(formatted);
}

/**
 * Trims to Telegram's limit at a paragraph or sentence boundary.
 *
 * Cutting mid-tag would make Telegram reject the whole message, and cutting
 * mid-sentence reads as the bot having been interrupted.
 */
function truncate(html: string): string {
  if (html.length <= MAX_MESSAGE) return html;

  const head = html.slice(0, MAX_MESSAGE);
  const boundary = Math.max(head.lastIndexOf("\n\n"), head.lastIndexOf(". "));

  return boundary > MAX_MESSAGE / 2 ? `${head.slice(0, boundary + 1)} […]` : `${head} […]`;
}
