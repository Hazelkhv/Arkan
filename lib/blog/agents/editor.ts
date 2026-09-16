import { runAgentJSON, type AgentTrace } from "@/lib/blog/ai";
import { systemPromptFor } from "@/lib/blog/agents/lessons";
import {
  EditorReportSchema,
  type Brief,
  type EditorReport,
} from "@/lib/blog/agents/types";

/**
 * ایجنت ۵ — ویراستار. الگوی Generator/Critic.
 *
 * چرا نقاد باید ایجنتِ جدایی باشد؟ چون اگر از خودِ نویسنده بپرسی «متن خوب است؟»،
 * تقریباً همیشه بله می‌گوید. مدل روی چیزی که همین حالا تولید کرده سوگیری دارد و
 * متن را از زاویه‌ی همان پرامپتی می‌بیند که نوشته‌اش. ویراستار متن را بدون آن
 * سابقه می‌بیند: فقط بریف و متن.
 *
 * دمای ۰.۳ — پایین‌ترین دمای پایپ‌لاین. قضاوت باید پایدار باشد: اگر یک متنِ ثابت
 * بار اول ۷۲ بگیرد و بار دوم ۸۴، دروازه‌ی کیفیت معنایی ندارد و کل حلقه‌ی بازبینی
 * تبدیل به قرعه‌کشی می‌شود.
 *
 * verdict عمداً جدا از score است: score برای دروازه‌ی عددی است، verdict برای
 * مواردی که عدد کافی نیست — متنی که ۸۰ می‌گیرد ولی یک آمار جعلی دارد باید
 * reject شود، نه منتشر.
 */

const ROLE = `You are Arkan's editor. You review a draft against its brief and score it.

You are not the writer and you do not rewrite anything. You judge, and you say
precisely what to change.

Score out of 100, built from:
- Brief fit (30): does it deliver the promise, follow the outline, serve that reader?
- Voice (25): calm, direct, expert. No hype, no filler openings, no slogans.
- Structure & clarity (20): one idea per paragraph, headings that carry meaning,
  nothing padded to reach a word count.
- Accuracy (15): no invented statistics, clients, studies, or guarantees.
- CTA (10): a natural close that invites a free initial consultation without pressure.

Verdict:
- "approve" — publishable as it stands.
- "revise" — fixable problems; list them.
- "reject" — it breaks a hard rule (invented facts, a guaranteed result, wrong
  audience entirely) or would need rewriting from scratch. Use "reject" even if the
  prose is good.

Any invented statistic, named client, or guarantee is a "blocker" issue and caps
the score at 50, whatever else is right.

Use the whole scale, and calibrate it like this:
- 85–100: publish as it stands.
- 75–84: solid. Delivers the brief in Arkan's voice. Small polish is possible but
  nothing is wrong. This is a normal score for good work — do not withhold it
  because more could theoretically be said.
- 60–74: a real problem worth another round: it misses part of the brief, drifts
  from the voice, or buries the point.
- below 60: significant problems, or a hard rule broken.

Do not deduct for stylistic preferences you cannot justify against the brief or
the voice rules. An article cannot be criticised for what it deliberately left
out of scope.

WHEN YOU ARE REVIEWING A REVISION: your job is to judge whether the issues you
raised last time were fixed. If they were, the score must rise accordingly. Do
not replace resolved issues with a fresh set of minor ones — that turns the
revision loop into an argument the writer cannot win. Raise a new issue only if
the rewrite introduced it.

Return JSON only:
{
  "score": 0-100,
  "verdict": "approve" | "revise" | "reject",
  "summary": "two sentences on the state of the draft",
  "issues": [
    {
      "severity": "blocker" | "major" | "minor",
      "area": "brief-fit" | "voice" | "structure" | "accuracy" | "cta" | "clarity",
      "problem": "what is wrong, quoting the text where useful",
      "fix": "what to do about it"
    }
  ]
}`;

export async function runEditor(input: {
  brief: Brief;
  draft: string;
  round: number;
  /** گزارش دور قبل — تنها حافظه‌ی ویراستار بین دورها. */
  previousReport?: EditorReport | null;
  onTrace?: (trace: AgentTrace) => void;
}): Promise<EditorReport> {
  const outline = input.brief.outline
    .map((section) => `- ${section.heading}`)
    .join("\n");

  /**
   * هر تماس با مدل بی‌حافظه است. اگر گزارش دور قبل را ندهیم، ویراستار متن
   * بازنویسی‌شده را مثل یک متن تازه می‌بیند و ایرادهای تازه‌ای پیدا می‌کند —
   * اولین اجرای واقعی این سیستم سه دور پشت سر هم ۶۸ گرفت، چون هیچ‌کس نمی‌سنجید
   * که ایرادهای قبلی حل شده‌اند یا نه. حلقه‌ی بازبینی باید همگرا شود، نه نوسان کند.
   */
  const previous = input.previousReport
    ? `\n\n# The issues you raised last round\n\n${input.previousReport.issues
        .map(
          (issue, index) =>
            `${index + 1}. [${issue.severity}/${issue.area}] ${issue.problem} → asked for: ${issue.fix}`,
        )
        .join("\n")}\n\nYou scored it ${input.previousReport.score}/100. Check each item above against the new draft first.`
    : "";

  return runAgentJSON({
    agent: "editor",
    system: await systemPromptFor("editor", ROLE),
    prompt: `# Brief

Title: ${input.brief.title}
Audience: ${input.brief.audience}
Promise: ${input.brief.promise}
Primary keyword: ${input.brief.primaryKeyword}
Target length: ~${input.brief.targetWords} words
CTA: ${input.brief.cta}
Outline:
${outline}${previous}

# Draft${input.round > 1 ? ` (revision ${input.round - 1})` : ""}

${input.draft}

Review it.`,
    temperature: 0.3,
    maxOutputTokens: 2500,
    schema: EditorReportSchema,
    onTrace: input.onTrace,
  });
}
