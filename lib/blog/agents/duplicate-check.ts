import { runAgentJSON, type AgentTrace } from "@/lib/blog/ai";
import type { TopicDigest } from "@/lib/blog/agents/novelty";
import {
  NoveltyVerdictSchema,
  type Idea,
  type NoveltyVerdict,
} from "@/lib/blog/agents/types";

/**
 * داورِ تکرار — کوچک‌ترین ایجنت این سیستم، و تنها کسی که حق «نه» گفتن به یک ایده
 * را دارد.
 *
 * چرا یک صدا زدنِ جدا، وقتی ایده‌یاب همین حالا هم موظف است تکراری ندهد؟ چون
 * ایده‌یاب دارد همزمان سه کار می‌کند — خلق ایده، امتیازدهی، و پرهیز از تکرار — و
 * وقتی مدلی روی «چیز جالبی بساز» متمرکز است، شرطِ منفی اولین چیزی است که از دستش
 * در می‌رود. در عمل هم همین شد: فهرست عنوان‌ها جلوی چشمش بود و باز مقاله‌ی دوم را
 * با کلمه‌های دیگر پیشنهاد داد.
 *
 * یک داور با یک سؤال و دو جواب ممکن، این مشکل را ندارد. ارزان هم هست: پرامپت
 * کوتاه، خروجی سه فیلد، دمای صفر.
 *
 * چرا اصلاً مدل، و نه کد؟ چون «آیا این همان حرف است؟» شمردنی نیست. سنجه‌ی واژگانی
 * در novelty.ts روی همان جفت مقاله‌ای که این باگ را ساخت ۰.۴۱ می‌دهد — دقیقاً همان
 * عددی که یک مقاله‌ی هم‌موضوعِ کاملاً متفاوت هم می‌گیرد. کد نامزدها را پیدا می‌کند،
 * قضاوت با مدل است. این تقسیم کار در کل پروژه همین است.
 *
 * یک نمونه‌ی واقعی داخل پرامپت هست — همان دو مقاله‌ای که باعث این باگ شدند. دلیلش
 * اندازه‌گیری است نه سلیقه: بدون آن نمونه، مدل همان جفت را «distinct» می‌خواند و
 * برای تفاوتشان توضیح قانع‌کننده هم می‌ساخت («یکی درباره‌ی بودجه است، دیگری درباره‌ی
 * مشتری»). با نمونه، همان جفت duplicate می‌شود و سه ایده‌ی واقعاً متفاوت همچنان
 * distinct می‌مانند. قاعده‌ی انتزاعی کافی نبود؛ یک مثالِ درست، بود.
 *
 * بدون درس — عمداً. AGENT_NAMES و check constraint دیتابیس تغییر نکرده‌اند و این
 * ایجنت حافظه‌ی خودبهبودی ندارد: یک درسِ بد به داورِ تکرار یا هر اجرا را می‌بندد یا
 * دروازه را باز می‌گذارد، و هر دو بی‌صدا هستند.
 */

const ROLE = `You decide one thing: whether a proposed article would repeat one
that Arkan has already published.

Arkan's blog has a narrow subject — a small or mid-sized business whose growth
has stalled — and almost every article ends in the same neighbourhood: the
strategy is undefined, here is how to define it, come and talk to us. That is
what makes this job hard. Two articles can enter from different symptoms, use
completely different words, and still be one article.

So do not compare subjects, and do not compare wording. Compare these three, in
this order:

1. The reader's situation. Who is this for, at what moment?
2. The diagnosis. What does the article tell them is actually wrong?
3. The advice. What does it tell them to do next?

If the diagnosis and the advice are the same, it is a DUPLICATE — even when the
opening symptom is different, even when one is about budget and the other about
customers, even when one is longer or has better examples. A different way into
the same answer is not a different article.

Here is the pair that this check exists because of:

  Published: "Why Your Marketing Budget Isn't Delivering More Sales" —
    businesses spend heavily on marketing and sales stay flat; the cause is the
    absence of a strategic direction; define the strategy.
  Proposed: "Why Your Business Isn't Attracting Its Ideal Customers (Even With
    Marketing)" — businesses spend on marketing and attract the wrong people;
    the cause is no clear strategic direction and no defined ideal customer;
    define them.

That is a DUPLICATE. Different symptom, one diagnosis, one piece of advice. A
reader who read the first learns nothing from the second. If you would have
called that pair distinct, you are being too generous.

It is DISTINCT when the reader ends up somewhere else: a different decision to
make, a different procedure to follow, a different question answered. "How to
decide which marketing channel to cut first" is distinct from both of the
above — it hands the reader a method, not the same diagnosis.

When the two readings are close and you cannot decide, say duplicate. Approving
a repeat puts a near-copy on the blog permanently; rejecting a good idea costs
one more round of thinking.

Return JSON only:
{
  "verdict": "distinct" | "duplicate",
  "closest": "title of the published article it repeats, or null when distinct",
  "reason": "one or two sentences. Name the shared diagnosis and advice, or name the different decision the reader is left with."
}`;

export async function runDuplicateCheck(input: {
  idea: Idea;
  /** نامزدهای نزدیک — نه کل کتابخانه. داور باید چند مورد را دقیق بخواند، نه پنجاه تا را سرسری. */
  candidates: TopicDigest[];
  onTrace?: (trace: AgentTrace) => void;
}): Promise<NoveltyVerdict> {
  // کتابخانه‌ی خالی: چیزی برای تکراری بودن وجود ندارد. توکن خرج نکن.
  if (input.candidates.length === 0) {
    return {
      verdict: "distinct",
      closest: null,
      reason: "Nothing has been published yet, so nothing can be repeated.",
    };
  }

  const published = input.candidates
    .map((post) => {
      const covers = post.excerpt.replace(/\s+/g, " ").trim().slice(0, 400);
      return `- "${post.title}"\n  covers: ${covers || "(no excerpt)"}\n  keywords: ${
        post.keywords.join(", ") || "(none)"
      }`;
    })
    .join("\n");

  return runAgentJSON({
    agent: "duplicate-check",
    system: ROLE,
    prompt: `Proposed article:
Title: ${input.idea.title}
Angle: ${input.idea.angle}
The scout says the closest published piece is ${
      input.idea.closestExisting ? `"${input.idea.closestExisting}"` : "none"
    }, and that it differs because: ${input.idea.differsFrom}

Published articles closest to it:
${published}

Would this repeat one of them?`,
    // دمای صفر: این یک قضاوت است، نه ایده‌پردازی. جواب باید دو بار اجرا، یکی باشد.
    temperature: 0,
    maxOutputTokens: 400,
    schema: NoveltyVerdictSchema,
    onTrace: input.onTrace,
  });
}
