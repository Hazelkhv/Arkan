import { runAgentText, WRITER_MODEL, type AgentTrace } from "@/lib/blog/ai";
import { systemPromptFor } from "@/lib/blog/agents/lessons";
import type { Brief, EditorReport, Research } from "@/lib/blog/agents/types";

/**
 * ایجنت ۴ — نویسنده.
 *
 * تنها ایجنتی که خروجی متنی آزاد می‌دهد، چون تنها ایجنتی است که مصرف‌کننده‌ی
 * خروجی‌اش انسان است نه ایجنت بعدی. بقیه باید JSON بدهند تا کد بتواند رویشان
 * شرط بگذارد؛ مقاله را نباید در JSON حبس کرد — نه escape کردنش می‌ارزد و نه
 * مدل در قالب JSON به همان روانی می‌نویسد.
 *
 * دو حالت دارد و هر دو در یک فایل می‌مانند، چون هر دو «همان شغل» هستند و همان
 * حافظه‌ی درس‌ها را دارند:
 *   draft  — نگارش اولیه، دمای ۰.۷
 *   revise — بازنویسی بر اساس ایرادهای ویراستار، دمای ۰.۵
 *
 * چرا دمای بازنویسی پایین‌تر است؟ چون در بازنویسی خلاقیت نمی‌خواهیم؛ می‌خواهیم
 * دقیقاً همان ایرادها برطرف شود و بقیه‌ی متن دست‌نخورده بماند. دمای بالا در این
 * مرحله یعنی مقاله‌ی جدیدی که ایرادهای جدیدی دارد.
 */

const ROLE = `You are Arkan's writer. You write the whole article, in English Markdown.

How to write:
- Follow the brief's outline. Its H2 headings are your sections, in that order.
- Open with the reader's situation, in two or three sentences. No "In today's
  fast-paced business world". No dictionary definitions.
- Short paragraphs, two to four sentences. One idea each.
- Use the research. Any figure you cite must come from it with a source; if the
  research has no source for something, write it as judgement ("in most of the
  businesses we work with"), never as a statistic.
- Speak as "we" (Arkan) to "you" (the reader). Never invent a client, a project,
  a percentage, an award or a testimonial.
- Close with a short section that leads into the brief's CTA. State it plainly —
  a free initial conversation, a reply within one business day. Do not promise an
  outcome.

Output rules:
- Markdown only. No front-matter, no code fences around the article, no commentary
  before or after it.
- Exactly one H1 (#) — the title. Sections are H2 (##).
- No emoji, no exclamation marks, no bold-shouting.`;

export async function runWriter(input: {
  brief: Brief;
  research: Research;
  onTrace?: (trace: AgentTrace) => void;
}): Promise<string> {
  const outline = input.brief.outline
    .map(
      (section) =>
        `## ${section.heading}\n${section.points.map((point) => `- ${point}`).join("\n")}`,
    )
    .join("\n\n");

  const facts = input.research.facts
    .map((fact) => `- ${fact.claim}${fact.source ? ` [source: ${fact.source}]` : " [no source — judgement only]"}`)
    .join("\n");

  return runAgentText({
    agent: "writer",
    model: WRITER_MODEL,
    system: await systemPromptFor("writer", ROLE),
    prompt: `# Brief

Title: ${input.brief.title}
Audience: ${input.brief.audience}
Promise: ${input.brief.promise}
Primary keyword: ${input.brief.primaryKeyword}
Secondary keywords: ${input.brief.secondaryKeywords.join(", ")}
Target length: ~${input.brief.targetWords} words
CTA: ${input.brief.cta}

## Outline to follow

${outline}

# Research

Facts:
${facts}

Examples:
${input.research.examples.map((example) => `- ${example}`).join("\n")}

Questions this reader asks:
${input.research.commonQuestions.map((question) => `- ${question}`).join("\n")}

Angle notes: ${input.research.angleNotes}

Write the article now.`,
    temperature: 0.7,
    maxOutputTokens: 6000,
    onTrace: input.onTrace,
  });
}

/**
 * بازنویسی. پیش‌نویس قبلی و گزارش ویراستار هر دو داده می‌شوند.
 *
 * نکته‌ی ظریف: به مدل صریح می‌گوییم فقط ایرادها را حل کند. بدون این قید، مدل
 * معمولاً کل متن را از نو می‌نویسد و ویراستار در دور بعد ایرادهای تازه‌ای پیدا
 * می‌کند — حلقه‌ی بازبینی به‌جای همگرایی، نوسان می‌کند.
 */
export async function runWriterRevision(input: {
  brief: Brief;
  research: Research;
  draft: string;
  report: EditorReport;
  onTrace?: (trace: AgentTrace) => void;
}): Promise<string> {
  const issues = input.report.issues
    .map(
      (issue, index) =>
        `${index + 1}. [${issue.severity} · ${issue.area}] ${issue.problem}\n   Fix: ${issue.fix}`,
    )
    .join("\n");

  return runAgentText({
    agent: "writer",
    model: WRITER_MODEL,
    system: await systemPromptFor("writer", ROLE),
    prompt: `Your draft was reviewed and scored ${input.report.score}/100.

Editor's summary: ${input.report.summary}

Issues to fix:
${issues || "(no itemised issues — raise the quality against the brief)"}

The brief has not changed:
Title: ${input.brief.title}
Promise: ${input.brief.promise}
Primary keyword: ${input.brief.primaryKeyword}
Target length: ~${input.brief.targetWords} words
CTA: ${input.brief.cta}

Here is your draft:

---
${input.draft}
---

Rewrite it. Fix every issue listed above and change nothing else — keep the
structure, the voice and the passages that were not criticised. Output the full
corrected article in Markdown, nothing else.`,
    temperature: 0.5,
    maxOutputTokens: 6000,
    onTrace: input.onTrace,
  });
}
