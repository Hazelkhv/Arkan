import { runAgentJSON, type AgentTrace } from "@/lib/blog/ai";
import { systemPromptFor } from "@/lib/blog/agents/lessons";
import { IdeaListSchema, type Idea, type IdeaList } from "@/lib/blog/agents/types";

/**
 * ایجنت ۱ — ایده‌یاب.
 *
 * شغلش فقط «پیدا کردن چیزی که ارزش نوشتن دارد» است. نمی‌نویسد، پژوهش نمی‌کند،
 * ساختار نمی‌چیند.
 *
 * دو تصمیم طراحی:
 *
 *  • دمای ۰.۸ — بالاترین دما در کل پایپ‌لاین. ایده‌پردازی تنها جایی است که تنوع
 *    ارزشمند است؛ اگر با دمای ۰.۲ صدایش بزنیم، هر هفته تقریباً همان سه ایده را
 *    می‌دهد.
 *  • عنوان پست‌های قبلی را می‌گیرد. مدل حافظه ندارد و بدون این فهرست، چهارمین
 *    اجرا هم «۵ اشتباه رایج در رشد کسب‌وکار» را پیشنهاد می‌دهد.
 */

const ROLE = `You are the content strategist who finds what Arkan should write about next.

Your job is to propose article ideas for Arkan's blog — not to write them.

What makes a good idea here:
- It names a problem the reader is living with right now ("sales flat for three
  quarters", "every decision still routes through the founder"), not a topic
  ("leadership").
- Arkan can answer it from consulting experience, without inventing data.
- It leads naturally toward a conversation with an advisor. A question that a
  five-minute search fully answers is a bad idea for this blog.
- It is not a rewrite of something already published (you are given the titles).

Scoring (0–10): relevance to the stuck-growth SMB reader (0–4), how directly it
supports a consultation request (0–3), and how specific and non-generic the angle
is (0–3). Be honest — a list where everything scores 9 is useless to me.

Return JSON only, in exactly this shape:
{
  "ideas": [
    {
      "title": "the article title as it would be published",
      "angle": "one or two sentences on the specific take",
      "searchIntent": "informational" | "commercial" | "comparison" | "how-to",
      "score": 0-10,
      "reason": "why this score"
    }
  ]
}
At least 5 ideas.`;

export async function runIdeaScout(input: {
  recentTitles: string[];
  topicHint?: string | null;
  onTrace?: (trace: AgentTrace) => void;
}): Promise<IdeaList> {
  const published =
    input.recentTitles.length > 0
      ? input.recentTitles.map((title) => `- ${title}`).join("\n")
      : "- (nothing published yet)";

  const hint = input.topicHint?.trim()
    ? `\n\nThe editor has asked for ideas around this theme, so weight it heavily:\n"${input.topicHint.trim()}"`
    : "";

  return runAgentJSON({
    agent: "idea-scout",
    system: await systemPromptFor("idea-scout", ROLE),
    prompt: `Already published — do not repeat these, and do not propose a near-duplicate:\n${published}${hint}\n\nPropose the next batch of ideas.`,
    temperature: 0.8,
    maxOutputTokens: 2000,
    schema: IdeaListSchema,
    onTrace: input.onTrace,
  });
}

/**
 * انتخاب بهترین ایده — کد، نه مدل.
 *
 * مدل امتیاز داده است؛ «بیشترین امتیاز برنده است» یک تصمیم قطعی است و هیچ دلیلی
 * ندارد دوباره به یک LLM سپرده شود. این همان مرزی است که در کل پروژه رعایت می‌کنیم:
 * قضاوت با مدل، انتخاب با کد.
 */
export function pickBestIdea(ideas: Idea[]): Idea {
  return [...ideas].sort((a, b) => b.score - a.score)[0];
}
