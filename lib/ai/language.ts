import type { StoredMessage } from "@/lib/ai/types";

/**
 * Which language the assistant answers in.
 *
 * This lives in lib/ai rather than in a channel because it is a rule about what
 * the assistant *says*, and every channel has to obey the same one. The full
 * page, the launcher, the widget and Telegram all reach it through the engine.
 *
 * Detection is script-based, not a model call. A visitor who types Persian is
 * asking in Persian whatever else is in the sentence, and one extra round trip
 * before every answer would be paid on every turn to learn something a regular
 * expression already knows. The cost of being wrong is one reply in the wrong
 * language, and the next message corrects it.
 *
 * The default is Persian. Arkan's visitors are in Tehran, so a message with
 * nothing to detect on — "ok", a phone number, an emoji — is far more likely to
 * be Persian than English. English is chosen only when there is Latin text to
 * choose it from.
 */

export type Language = "fa" | "en";

export const DEFAULT_LANGUAGE: Language = "fa";

/** Arabic script, including the Persian-only letters and the presentation forms. */
const PERSIAN_LETTERS = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/g;

const LATIN_LETTERS = /[A-Za-z]/g;

/**
 * Enough Persian to count as a Persian message.
 *
 * Not "any Persian letter at all": an English question that quotes one Persian
 * word — a company name, a term the visitor is asking about — is still an
 * English question. A fifth of the letters is well above what a quoted word
 * contributes and well below what a Persian sentence with English nouns in it
 * ("قیمت services چقدره؟") drops to.
 */
const PERSIAN_SHARE = 0.2;

/**
 * Persian typed in Latin letters, which is how a great many Iranians write in
 * a browser that is not set up for Persian input.
 *
 * Deliberately short and deliberately distinctive. Every entry is a word that
 * does not occur in English, because a false positive here answers an English
 * speaker in Persian — a worse failure than missing a Finglish message, which
 * the visitor's next reply corrects anyway.
 */
const FINGLISH = new Set([
  "salam",
  "chetori",
  "khoobi",
  "mikham",
  "mikhastam",
  "mikhay",
  "chie",
  "chiye",
  "gheymat",
  "hazine",
  "lotfan",
  "mamnoon",
  "khadamat",
  "moshavere",
  "moshaver",
  "sherkat",
  "kasbokar",
  "chand",
  "chera",
  "koja",
  "baraye",
  "darid",
  "hastid",
  "hastam",
  "mitoonam",
  "mitunam",
  "shoma",
]);

/**
 * The language of one piece of text, or null when there is nothing to go on.
 *
 * Null rather than a default, so a caller can fall back to what the rest of the
 * conversation was in before falling back to the default. A visitor who has
 * been writing Persian and then sends "ok" has not switched to English.
 */
export function detectLanguage(text: string): Language | null {
  const persian = (text.match(PERSIAN_LETTERS) ?? []).length;
  const latin = (text.match(LATIN_LETTERS) ?? []).length;

  if (persian > 0) {
    return persian / (persian + latin) >= PERSIAN_SHARE ? "fa" : "en";
  }

  if (latin === 0) return null;

  for (const word of text.toLowerCase().split(/[^a-z]+/)) {
    if (word && FINGLISH.has(word)) return "fa";
  }

  return "en";
}

/**
 * The language this turn should be answered in.
 *
 * The current message wins. Where it carries no signal the most recent visitor
 * message that did is used, and only then the default — which is what lets a
 * Persian conversation survive a one-word reply without flipping to English.
 */
export function resolveLanguage(
  message: string,
  history: readonly StoredMessage[] = [],
): Language {
  const current = detectLanguage(message);
  if (current) return current;

  for (let i = history.length - 1; i >= 0; i -= 1) {
    const past = history[i];
    if (past.role !== "user") continue;

    const detected = detectLanguage(past.content);
    if (detected) return detected;
  }

  return DEFAULT_LANGUAGE;
}

/**
 * The instruction that makes the language rule stick.
 *
 * Sent as its own system message at the end of the stack rather than buried in
 * the persona, for two reasons. The persona in the database is operator-edited
 * and may be years old by the time anyone reads this — the rule has to reach
 * the model whatever that row says. And an instruction adjacent to the question
 * is followed far more reliably than the same sentence a thousand tokens above
 * it, which is exactly the failure this is fixing.
 */
export function languageDirective(language: Language): string {
  if (language === "fa") {
    return (
      "# Language\n\n" +
      "The visitor is writing in Persian. Answer this turn entirely in " +
      "Persian (فارسی), including the greeting, any list, any confirmation " +
      "and the closing sentence. Do not answer in English and do not offer " +
      "an English translation alongside it.\n\n" +
      "Write natural, professional Persian — not a word-for-word rendering of " +
      "an English sentence.\n\n" +
      "The firm's name is written «آرکان» in Persian — always with the initial " +
      "آ, never «ارکان», and never with Latin letters mixed into it. Email " +
      "addresses, phone numbers and URLs are reproduced exactly as the source " +
      "has them, with Western digits, and are never transliterated."
    );
  }

  return (
    "# Language\n\n" +
    "The visitor is writing in English. Answer this turn entirely in English.\n\n" +
    "If they switch to another language later, switch with them: always reply " +
    "in the language of their most recent message."
  );
}

/**
 * The sentences the engine itself says, in both languages.
 *
 * These are not the assistant talking — they are the system reporting a rate
 * limit, a failure, or an operator taking over — so no model is involved and
 * there is nothing to translate at runtime. They still have to follow the
 * visitor's language, because a Persian conversation that fails in English has
 * failed twice.
 */
export const systemMessages = {
  failure: {
    en:
      "Something went wrong at our end. Please try again, or email " +
      "nazanin.khosravi20.nk@gmail.com and the team will pick it up.",
    fa:
      "مشکلی از سمت ما پیش آمد. لطفاً دوباره تلاش کنید، یا به " +
      "nazanin.khosravi20.nk@gmail.com ایمیل بزنید تا تیم پیگیری کند.",
  },
  tooFast: {
    en: "That is a lot of questions at once. Give it a moment and send that again.",
    fa: "پیام‌ها خیلی پشت سر هم رسیدند. یک لحظه صبر کنید و دوباره بفرستید.",
  },
  paused: {
    en:
      "A colleague from the Arkan team is replying to this conversation. Your " +
      "message has been passed to them.",
    fa:
      "یکی از همکاران تیم آرکان در حال پاسخ به این گفت‌وگوست. پیام شما به او " +
      "منتقل شد.",
  },
  empty: {
    en: "Ask me something and I will help if I can.",
    fa: "سؤالتان را بپرسید؛ اگر بتوانم کمک می‌کنم.",
  },
} as const;

export function say(
  key: keyof typeof systemMessages,
  language: Language,
): string {
  return systemMessages[key][language];
}
