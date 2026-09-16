import { runAgentJSON, type AgentTrace } from "@/lib/blog/ai";
import { systemPromptFor } from "@/lib/blog/agents/lessons";
import type { Duplicate, TopicDigest } from "@/lib/blog/agents/novelty";
import { IdeaListSchema, type Idea, type IdeaList } from "@/lib/blog/agents/types";

/**
 * ایجنت ۱ — ایده‌یاب.
 *
 * شغلش فقط «پیدا کردن چیزی که ارزش نوشتن دارد» است. نمی‌نویسد، پژوهش نمی‌کند،
 * ساختار نمی‌چیند.
 *
 * سه تصمیم طراحی:
 *
 *  • دمای ۰.۸ — بالاترین دما در کل پایپ‌لاین. ایده‌پردازی تنها جایی است که تنوع
 *    ارزشمند است؛ اگر با دمای ۰.۲ صدایش بزنیم، هر هفته تقریباً همان سه ایده را
 *    می‌دهد.
 *  • کتابخانه‌ی موجود را می‌بیند — نه فقط عنوان‌ها. نسخه‌ی اول فقط فهرست عنوان
 *    می‌داد و نتیجه دو مقاله بود که عنوانشان فرق داشت و حرفشان یکی بود. عنوان،
 *    محتوای مقاله را نشان نمی‌دهد؛ چکیده و کلیدواژه نشان می‌دهند.
 *  • هر ایده باید نزدیک‌ترین پست موجود را اسم ببرد و تفاوتش را بنویسد
 *    (closestExisting و differsFrom). مقایسه‌ی اجباری، مقایسه‌ای است که واقعاً
 *    انجام می‌شود.
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

What counts as a repeat — read this twice, it is where this job goes wrong:
An idea is a repeat when it would give the reader the same diagnosis and the
same advice as something already published, no matter how different the wording
is. "Why your marketing budget isn't delivering sales" and "why your marketing
isn't reaching the right customers" are one article wearing two titles: same
reader, same cause, same answer. The test is not "do the titles overlap?" — it
is "if they already read the published one, is there anything left to learn
here?". If the honest answer is no, the idea does not go in the list.

You are given every article already on the blog, with what it covers. For each
idea you propose, name the closest one and say what a reader gets here that they
do not get there. If you cannot write that sentence, drop the idea.

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
      "reason": "why this score",
      "closestExisting": "the exact title of the nearest published article, or null if the blog is empty",
      "differsFrom": "what this article gives the reader that the nearest one does not"
    }
  ]
}
At least 5 ideas.`;

/** کتابخانه‌ی موجود، همان‌طور که مدل می‌بیندش. */
function libraryBlock(published: TopicDigest[]): string {
  if (published.length === 0) return "- (nothing published yet)";

  return published
    .map((post) => {
      const covers = post.excerpt.replace(/\s+/g, " ").trim().slice(0, 220);
      const keywords = post.keywords.slice(0, 6).join(", ");
      return [
        `- "${post.title}"`,
        `  covers: ${covers || "(no excerpt)"}`,
        keywords ? `  keywords: ${keywords}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
}

/**
 * ایده‌هایی که دور قبل به‌عنوان تکراری رد شدند.
 *
 * بدون این، دور دوم با همان ورودی همان ایده‌ها را می‌دهد — مدل حافظه‌ای از تلاش
 * قبلی ندارد. همان الگوی «خطا را به خودش برگردان» که در runAgentJSON هست.
 */
function rejectionBlock(rejected: Duplicate[]): string {
  if (rejected.length === 0) return "";

  const lines = rejected
    .map((item) => `- "${item.title}" — too close to "${item.closest}"`)
    .join("\n");

  return `\n\nThese were already proposed and rejected as repeats. Do not propose them again, and do not propose a variation of them:\n${lines}\n\nGo somewhere the blog has not been.`;
}

export async function runIdeaScout(input: {
  /** هر پستی که روی بلاگ هست — پیش‌نویس‌ها هم، چون آن‌ها هم روزی منتشر می‌شوند. */
  published: TopicDigest[];
  topicHint?: string | null;
  rejected?: Duplicate[];
  onTrace?: (trace: AgentTrace) => void;
}): Promise<IdeaList> {
  const hint = input.topicHint?.trim()
    ? `\n\nThe editor has asked for ideas around this theme, so weight it heavily:\n"${input.topicHint.trim()}"`
    : "";

  return runAgentJSON({
    agent: "idea-scout",
    system: await systemPromptFor("idea-scout", ROLE),
    prompt: `Already on the blog — none of your ideas may repeat one of these:\n${libraryBlock(
      input.published,
    )}${hint}${rejectionBlock(input.rejected ?? [])}\n\nPropose the next batch of ideas.`,
    temperature: 0.8,
    maxOutputTokens: 2500,
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
 *
 * انتخاب نهایی ارکستریتور از این عبور می‌کند ولی به آن ختم نمی‌شود: ایده‌ی برنده
 * باید از دروازه‌ی تکرار هم رد شود (novelty.ts). این تابع فقط «بهترین» را می‌گوید.
 */
export function pickBestIdea(ideas: Idea[]): Idea {
  return [...ideas].sort((a, b) => b.score - a.score)[0];
}
