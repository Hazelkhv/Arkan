import { runAgentJSON, type AgentTrace } from "@/lib/blog/ai";
import { systemPromptFor } from "@/lib/blog/agents/lessons";
import { SeoResultSchema, type Brief, type SeoResult } from "@/lib/blog/agents/types";
import {
  clampToLength,
  failedChecks,
  runSeoChecks,
  slugify,
  type SeoCheck,
} from "@/lib/blog/agents/seo-checks";

/**
 * ایجنت ۶ — متخصص سئو. نیمی مدل، نیمی کد.
 *
 * مدل چیزهایی می‌سازد که قضاوت می‌خواهند: عنوانی که کلیک بگیرد، توضیحی که خواندن
 * مقاله را بیرزد، پرسش‌هایی که واقعاً پرسیده می‌شوند.
 *
 * کد چیزهایی را بررسی می‌کند که شمردنی‌اند (seo-checks.ts) و چیزهایی را که باید
 * قطعی باشند تعمیر می‌کند — مثل اسلاگ. حتی وقتی Zod شکل اسلاگ را اجبار کرده،
 * دوباره از slugify رد می‌شود: اعتبارسنجی «رد می‌کند»، نرمال‌سازی «درست می‌کند»،
 * و برای چیزی که در URL می‌نشیند، دومی را می‌خواهیم.
 */

const ROLE = `You are the SEO editor. The article is finished; you package it.

You do not change the article and you do not report on it. You produce the
metadata it ships with.

- metaTitle: 50–60 characters, contains the primary keyword, reads like a
  sentence a human wrote. Not "Title | Arkan | Business Consulting".
- metaDescription: 140–158 characters. Say what the reader gets. No "Learn more
  about...", no keyword stuffing, no exclamation marks.
- excerpt: 120–200 characters, used on the blog index as the card summary. Plain
  sentence, no ellipsis at the end.
- slug: lowercase kebab-case, 3–6 words, built from the primary keyword. No
  stop-word padding, no year, no question marks.
- keywords: 4–8 terms this article can genuinely rank for.
- faq: 2–4 questions this reader really asks, each answered in 2–3 sentences from
  the article's own content. This becomes FAQPage structured data, so an answer
  that is not supported by the article is a lie told to a search engine — take it
  only from the text.

Return JSON only:
{
  "slug": "...",
  "metaTitle": "...",
  "metaDescription": "...",
  "excerpt": "...",
  "keywords": ["...", "..."],
  "faq": [{ "question": "...", "answer": "..." }]
}`;

export type SeoOutcome = {
  seo: SeoResult;
  checks: SeoCheck[];
  failed: SeoCheck[];
};

export async function runSeo(input: {
  brief: Brief;
  contentMd: string;
  onTrace?: (trace: AgentTrace) => void;
}): Promise<SeoOutcome> {
  const generated = await runAgentJSON({
    agent: "seo",
    system: await systemPromptFor("seo", ROLE),
    prompt: `Primary keyword: ${input.brief.primaryKeyword}
Secondary keywords: ${input.brief.secondaryKeywords.join(", ")}
Audience: ${input.brief.audience}

Article:

${input.contentMd}

Produce the metadata.`,
    temperature: 0.4,
    maxOutputTokens: 1500,
    schema: SeoResultSchema,
    onTrace: input.onTrace,
  });

  /**
   * تعمیر قطعی، قبل از چک کردن.
   *
   * اسلاگ همیشه از slugify رد می‌شود و طول‌ها روی مرز کلمه کوتاه می‌شوند. مدل
   * بارها تا چند کاراکتر از سقف رد می‌شود؛ این یک خطا نیست، یک اصلاح یک‌خطی است.
   * چکِ بعدی همچنان گزارش می‌دهد که آیا نتیجه در بازه‌ی ایده‌آل نشسته یا نه.
   */
  const seo: SeoResult = {
    ...generated,
    slug: slugify(generated.slug),
    metaDescription: clampToLength(generated.metaDescription, 158),
    excerpt: clampToLength(generated.excerpt, 200),
  };

  const checks = runSeoChecks({
    contentMd: input.contentMd,
    primaryKeyword: input.brief.primaryKeyword,
    targetWords: input.brief.targetWords,
    metaTitle: seo.metaTitle,
    metaDescription: seo.metaDescription,
    slug: seo.slug,
    excerpt: seo.excerpt,
  });

  return { seo, checks, failed: failedChecks(checks) };
}
