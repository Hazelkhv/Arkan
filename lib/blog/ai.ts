import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, type ModelMessage } from "ai";
import type { ZodType } from "zod";

/**
 * هسته‌ی AI — تنها جایی که این سیستم با یک مدل حرف می‌زند.
 *
 * هشت ایجنت داریم و هشت راه متفاوت برای صدا زدن مدل نمی‌خواهیم. هر چیزی که
 * «چگونه با مدل حرف بزنیم» است (کلید، مدل پیش‌فرض، تلاش دوباره، استخراج JSON)
 * اینجاست؛ هر چیزی که «چه بگوییم» است در فایل خودِ ایجنت. اگر روزی OpenRouter
 * عوض شود، فقط این فایل تغییر می‌کند.
 *
 * دو کمکی بیرون می‌دهد:
 *   runAgentText — خروجی متنی آزاد. فقط نویسنده از آن استفاده می‌کند، چون
 *                  مصرف‌کننده‌ی خروجی‌اش انسان است نه ایجنت بعدی.
 *   runAgentJSON — خروجی ساخت‌یافته با اعتبارسنجی Zod و یک دور اصلاح.
 */

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * مدل پیش‌فرض همه‌ی ایجنت‌ها. تعویض مدل = تعویض یک slug، نه تغییر کد؛ چون همه‌ی
 * مدل‌ها از یک endpoint سازگار با OpenAI و یک کلید واحد می‌آیند.
 */
export const PIPELINE_MODEL =
  process.env.PIPELINE_MODEL || "google/gemini-2.5-flash";

/**
 * نویسنده تنها ایجنتی است که خروجی‌اش را انسان می‌خواند، پس تنها ایجنتی است که
 * ارزش دارد مدل گران‌تر بگیرد. بقیه قضاوت و ساختاردهی می‌کنند و مدل سریع کافی است.
 *
 * `||` و نه `??` — طبق قاعده‌ی پروژه: متغیر خالی در .env باید به fallback برگردد،
 * و "" مقدار nullish نیست.
 */
export const WRITER_MODEL = process.env.WRITER_MODEL || PIPELINE_MODEL;

/** خطای قابل‌نمایش یک ایجنت. ارکستریتور همین را در رکورد اجرا ثبت می‌کند. */
export class AgentError extends Error {
  constructor(
    message: string,
    readonly agent?: string,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "AgentError";
  }
}

/**
 * درس فاز ۲، به‌شکل ده خط کد.
 *
 * بعضی مدل‌های OpenRouter (خانواده‌های reasoning) استدلال اجباری دارند: اگر جلوی
 * آن گرفته نشود، کل بودجه‌ی توکن صرف فکر کردن می‌شود و `text` خالی برمی‌گردد —
 * بدون هیچ خطایی. AI SDK فیلد استانداردی برای این ندارد، پس بدنه‌ی درخواست را در
 * لحظه‌ی ارسال دستکاری می‌کنیم. مدل‌هایی که reasoning ندارند این فیلد را نادیده
 * می‌گیرند، پس تزریق سراسری بی‌خطر است.
 */
const lowEffortReasoningFetch: typeof fetch = async (input, init) => {
  if (init && typeof init.body === "string") {
    try {
      const body = JSON.parse(init.body) as Record<string, unknown>;
      body.reasoning = { effort: "low" };
      init = { ...init, body: JSON.stringify(body) };
    } catch {
      // بدنه JSON نبود — دست‌نخورده بفرست.
    }
  }
  return fetch(input, init);
};

const openrouter = createOpenAICompatible({
  name: "openrouter",
  baseURL: OPENROUTER_BASE_URL,
  apiKey: process.env.OPENROUTER_API_KEY || "",
  headers: {
    // فقط برای انتساب هزینه در داشبورد OpenRouter. اختیاری است.
    "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "https://arkan.co",
    "X-Title": "Arkan blog pipeline",
  },
  fetch: lowEffortReasoningFetch,
});

/** یک خط گزارش از هر تماس با مدل — ارکستریتور با آن هزینه را ثبت می‌کند. */
export type AgentTrace = {
  agent: string;
  model: string;
  ms: number;
  inputTokens?: number;
  outputTokens?: number;
  attempts: number;
};

type RunOptions = {
  /** نام ایجنت؛ برای پیام خطا و گزارش. */
  agent: string;
  system: string;
  prompt: string;
  /** پیش‌فرض PIPELINE_MODEL. نویسنده WRITER_MODEL می‌دهد. */
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  onTrace?: (trace: AgentTrace) => void;
};

function assertKey(agent: string) {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new AgentError(
      "OPENROUTER_API_KEY is not set. The blog pipeline cannot run without it.",
      agent,
    );
  }
}

async function call(
  opts: RunOptions & { messages: ModelMessage[]; attempt: number },
): Promise<string> {
  const model = opts.model || PIPELINE_MODEL;
  const startedAt = Date.now();
  try {
    const result = await generateText({
      model: openrouter(model),
      system: opts.system,
      messages: opts.messages,
      temperature: opts.temperature,
      maxOutputTokens: opts.maxOutputTokens || 4000,
    });
    opts.onTrace?.({
      agent: opts.agent,
      model,
      ms: Date.now() - startedAt,
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
      attempts: opts.attempt,
    });
    return result.text.trim();
  } catch (error) {
    throw new AgentError(
      `${opts.agent}: the model call failed (${model}). ${
        error instanceof Error ? error.message : String(error)
      }`,
      opts.agent,
      error,
    );
  }
}

/** خروجی متنی آزاد. */
export async function runAgentText(opts: RunOptions): Promise<string> {
  assertKey(opts.agent);
  const text = await call({
    ...opts,
    messages: [{ role: "user", content: opts.prompt }],
    attempt: 1,
  });
  if (!text) {
    throw new AgentError(
      `${opts.agent}: the model returned an empty answer.`,
      opts.agent,
    );
  }
  return text;
}

/**
 * بلوک JSON را از یک پاسخ متنی بیرون می‌کشد.
 *
 * مدل‌ها عادت دارند JSON را لای حصار مارک‌داون بپیچند یا قبلش یک جمله‌ی مقدمه
 * بگذارند. به‌جای امید بستن به «فقط JSON بده»، اولین `{` یا `[` را پیدا می‌کنیم و
 * با شمارش پرانتزها — و رد کردن پرانتزهای داخل رشته — تا جفتش جلو می‌رویم.
 *
 * تابع خالص است و در tests/ مستقیم تست می‌شود.
 */
export function extractJsonBlock(raw: string): string | null {
  const text = raw.replace(/^﻿/, "");
  const start = text.search(/[{[]/);
  if (start === -1) return null;

  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function formatIssues(error: unknown): string {
  if (typeof error === "object" && error && "issues" in error) {
    const issues = (
      error as { issues: Array<{ path: PropertyKey[]; message: string }> }
    ).issues;
    return issues
      .map(
        (issue) =>
          `- ${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`,
      )
      .join("\n");
  }
  return String(error);
}

/**
 * خروجی ساخت‌یافته و وارسی‌شده: استخراج JSON → اعتبارسنجی Zod → در صورت خرابی،
 * یک دور اصلاح با برگرداندن خطای دقیق به خود مدل.
 *
 * چرا generateObject نه؟ چون پشتیبانی از JSON mode و tool-calling بین ده‌ها مدل
 * OpenRouter ناسازگار است؛ همان کدی که با یک مدل کار می‌کند با مدل بعدی خطا
 * می‌گیرد. استخراج دستی + Zod + یک retry روی همه‌ی مدل‌ها کار می‌کند و مکانیزمش
 * هم قابل دیدن است. (در پروژه‌ی واقعی با یک provider ثابت، generateObject تمیزتر
 * است.)
 *
 * چرا فقط یک دور اصلاح؟ چون اگر مدل با دیدن خطای دقیق هم نتوانست درست کند، تلاش
 * سوم هم نمی‌تواند؛ فقط پول و زمان خرج می‌شود. شکست سریع با پیام روشن.
 */
export async function runAgentJSON<T>(
  opts: RunOptions & { schema: ZodType<T> },
): Promise<T> {
  assertKey(opts.agent);

  const messages: ModelMessage[] = [{ role: "user", content: opts.prompt }];
  let lastProblem = "";

  for (let attempt = 1; attempt <= 2; attempt++) {
    const raw = await call({ ...opts, messages, attempt });
    const block = extractJsonBlock(raw);

    if (block) {
      let parsed: unknown;
      let broken = false;
      try {
        parsed = JSON.parse(block);
      } catch (error) {
        broken = true;
        lastProblem = `The JSON is malformed: ${
          error instanceof Error ? error.message : String(error)
        }`;
      }
      if (!broken) {
        const result = opts.schema.safeParse(parsed);
        if (result.success) return result.data;
        lastProblem = `The JSON does not match the required shape:\n${formatIssues(
          result.error,
        )}`;
      }
    } else {
      lastProblem = "No JSON object or array was found in the answer.";
    }

    if (attempt === 2) break;

    // دور اصلاح: پاسخ خودش + خطای دقیق را برمی‌گردانیم. مدل وقتی خطا را می‌بیند
    // معمولاً درست می‌کند؛ وقتی فقط «دوباره تلاش کن» بشنود، همان اشتباه را تکرار
    // می‌کند.
    messages.push({ role: "assistant", content: raw });
    messages.push({
      role: "user",
      content: `That response could not be used. ${lastProblem}\n\nReply again with the corrected JSON only — no prose, no markdown fence, nothing before or after it.`,
    });
  }

  throw new AgentError(
    `${opts.agent}: could not produce valid structured output after two attempts. ${lastProblem}`,
    opts.agent,
  );
}
