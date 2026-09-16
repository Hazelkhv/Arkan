import { runAgentJSON, type AgentTrace } from "@/lib/blog/ai";
import { systemPromptFor } from "@/lib/blog/agents/lessons";
import { BriefSchema, type Brief, type Idea } from "@/lib/blog/agents/types";

/**
 * ایجنت ۲ — استراتژیست.
 *
 * چرا اصلاً این ایجنت وجود دارد؟ می‌شد ایده را مستقیم به نویسنده داد. ولی آن‌وقت
 * نویسنده هم‌زمان دو کار می‌کرد: تصمیم می‌گرفت مقاله چه باشد، و می‌نوشت. نتیجه‌اش
 * متنی است که خوب نوشته شده ولی معلوم نیست چه می‌خواست بگوید — و مهم‌تر: هیچ
 * معیاری برای قضاوتش نداریم.
 *
 * بریف، همان معیار است. ویراستار در گام بعد نمی‌پرسد «متن خوب است؟» (سؤالی که
 * پاسخش سلیقه است)، می‌پرسد «متن به قولِ بریف عمل کرده؟» — سؤالی که پاسخ دارد.
 *
 * این جداسازیِ «تصمیم» از «تولید» است.
 */

const ROLE = `You are the editor who turns an approved idea into a content brief.

You do not write the article. You decide what the article must do, and hand the
writer something precise enough that two different writers would produce
recognisably the same piece.

Rules for the brief:
- The outline is the article's spine: 4–7 H2 sections in reading order, each with
  2–4 concrete points. The first section must engage the reader's situation, not
  define terms. The last section before the CTA should point at what to do next.
- Target length: 900–1400 words for most pieces. Longer only if the outline
  genuinely needs it.
- The primary keyword is what this reader would actually type. Plain words, not
  jargon.
- The CTA is one sentence, inviting a free initial consultation. Calm, no
  pressure, no promise of results.
- The promise is what the reader can do after reading that they could not before.

Return JSON only:
{
  "title": "working title",
  "audience": "who exactly this is for and what they are struggling with",
  "promise": "what the reader can do after reading",
  "primaryKeyword": "...",
  "secondaryKeywords": ["...", "..."],
  "outline": [{ "heading": "H2 text", "points": ["...", "..."] }],
  "targetWords": 1200,
  "cta": "one sentence"
}`;

export async function runStrategist(input: {
  idea: Idea;
  onTrace?: (trace: AgentTrace) => void;
}): Promise<Brief> {
  return runAgentJSON({
    agent: "strategist",
    system: await systemPromptFor("strategist", ROLE),
    prompt: `Approved idea:

Title: ${input.idea.title}
Angle: ${input.idea.angle}
Search intent: ${input.idea.searchIntent}
Why it was chosen: ${input.idea.reason}

Write the content brief.`,
    temperature: 0.7,
    maxOutputTokens: 2000,
    schema: BriefSchema,
    onTrace: input.onTrace,
  });
}
