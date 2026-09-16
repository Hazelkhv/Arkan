import type { Idea } from "@/lib/blog/agents/types";
import type { PostRecord } from "@/lib/blog/store/types";

/**
 * دروازه‌ی تکرار — جلوگیری از نوشتن دوباره‌ی مقاله‌ای که قبلاً نوشته‌ایم.
 *
 * نسخه‌ی اول فقط عنوان پست‌های قبلی را به ایده‌یاب می‌داد و از او می‌خواست تکرار
 * نکند. نتیجه در عمل این شد:
 *
 *   «Why Your Business Isn't Attracting Its Ideal Customers (Even With Marketing)»
 *   «Why Your Marketing Budget Isn't Delivering More Sales (And What To Do About It)»
 *
 * از نظر کلمه‌ها دو عنوان متفاوت‌اند؛ از نظر خواننده یک مقاله‌اند. درس: «تکراری
 * نباشد» یک دستور است، نه یک تضمین. هر قاعده‌ای که فقط در پرامپت زندگی می‌کند،
 * روزی نادیده گرفته می‌شود.
 *
 * پس دو لایه داریم:
 *
 *   لایه‌ی مدل — ایده‌یاب حالا چکیده و کلیدواژه‌ی هر پست را می‌بیند (نه فقط عنوان)
 *                و مجبور است برای هر ایده بگوید نزدیک‌ترین پست منتشرشده کدام است
 *                و این یکی چه چیزی به خواننده می‌دهد که آن یکی نمی‌دهد.
 *   لایه‌ی کد   — همین فایل. یک سنجه‌ی واژگانی که تکرارهای آشکار را می‌گیرد،
 *                بدون هیچ توکنی، و قابل تست.
 *
 * سنجه‌ی واژگانی عمداً «تقریبی» است و ادعای فهم معنا ندارد: کارش گرفتن حالتی است
 * که مدل تقریباً همان عنوان را دوباره پیشنهاد داده. قضاوت ظریف‌تر — «آیا این همان
 * حرف است؟» — کار مدل است، چون شمردنی نیست.
 */

/** آنچه از یک پست منتشرشده برای سنجش تکرار لازم است. */
export type TopicDigest = {
  title: string;
  excerpt: string;
  keywords: string[];
};

export function digestOf(post: PostRecord): TopicDigest {
  return { title: post.title, excerpt: post.excerpt, keywords: post.keywords };
}

/**
 * واژه‌های بی‌اثر.
 *
 * دسته‌ی دوم مهم‌تر از دسته‌ی اول است: «business»، «company»، «growth» در بلاگ یک
 * مشاور کسب‌وکار تقریباً در هر جمله‌ای هست. اگر بمانند، هر دو مقاله شبیه هم به‌نظر
 * می‌رسند و دروازه یا همه چیز را رد می‌کند یا هیچ‌چیز را.
 */
const STOPWORDS = new Set(
  `a an and are as at be been but by can cant could did do does doesnt dont for from
   get gets had has have how i if in into is isnt it its just like made make more most
   no not of on one only or our out over own same should so some such than that the
   their them then there these they this those to too until up use used using very was
   were what when where which while who why will with without wont you your yours
   business businesses company companies firm firms owner owners founder founders
   growth growing grow article post blog guide tips ways things stop stops stopped
   need needs really actually even still first next best good better`
    .split(/\s+/)
    .filter(Boolean),
);

/** ریشه‌ی خیلی ساده: فقط جمع انگلیسی. هدف، تطبیق «customer» با «customers» است. */
function stem(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && (word.endsWith("ses") || word.endsWith("ches"))) {
    return word.slice(0, -2);
  }
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) {
    return word.slice(0, -1);
  }
  return word;
}

export function topicTokens(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const tokens = new Set<string>();
  for (const word of words) {
    if (word.length < 3 || STOPWORDS.has(word)) continue;
    const root = stem(word);
    if (!STOPWORDS.has(root)) tokens.add(root);
  }
  return tokens;
}

/**
 * ضریب هم‌پوشانی، نه Jaccard.
 *
 * مخرج، اندازه‌ی مجموعه‌ی کوچک‌تر است تا یک عنوان کوتاه که کاملاً داخل چکیده‌ی یک
 * پست بلند است، به‌خاطر بلندی آن پست امتیاز پایین نگیرد.
 */
function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared++;
  return shared / Math.min(a.size, b.size);
}

/**
 * شباهت یک ایده به یک پست منتشرشده، بین ۰ و ۱.
 *
 * دو سنجه: عنوان با عنوان، و کل متن با کل متن. عنوانِ یکسان به‌تنهایی کافی است
 * (max)، وگرنه میانگین دو سنجه — چون دو عنوانِ متفاوت با بدنه‌ی یکسان هم تکرار است.
 */
export function similarity(
  idea: Pick<Idea, "title" | "angle">,
  topic: TopicDigest,
): number {
  const ideaTitle = topicTokens(idea.title);
  const postTitle = topicTokens(topic.title);
  const ideaAll = topicTokens(`${idea.title} ${idea.angle}`);
  const postAll = topicTokens(
    `${topic.title} ${topic.excerpt} ${topic.keywords.join(" ")}`,
  );

  const titleSim = overlap(ideaTitle, postTitle);
  const bodySim = overlap(ideaAll, postAll);
  return Math.max(titleSim, (titleSim + bodySim) / 2);
}

export type Duplicate = {
  /** عنوان ایده‌ی ردشده. */
  title: string;
  /** پستی که با آن برخورد داشت. */
  closest: string;
  /** وقتی سنجه‌ی واژگانی رد کرده است. */
  similarity?: number;
  /** وقتی داور رد کرده است — جمله‌ی خودش. */
  reason?: string;
};

export function closestTopic(
  idea: Pick<Idea, "title" | "angle">,
  published: TopicDigest[],
): { topic: TopicDigest; similarity: number } | null {
  let best: { topic: TopicDigest; similarity: number } | null = null;
  for (const topic of published) {
    const score = similarity(idea, topic);
    if (!best || score > best.similarity) best = { topic, similarity: score };
  }
  return best;
}

/**
 * آستانه‌ی تکرار.
 *
 * عمداً بالا است، و دلیلش یک اندازه‌گیری است نه یک حدس. روی همان جفت مقاله‌ای که
 * این باگ را ساخت، این سنجه ۰.۴۱ می‌دهد — و یک ایده‌ی هم‌موضوعِ کاملاً متفاوت
 * («کدام کانال بازاریابی را اول قطع کنیم») ۰.۴۰. یعنی در آن ناحیه، شباهت واژگانی
 * اصلاً تکرار را از نو بودن جدا نمی‌کند؛ هر آستانه‌ای آنجا یا هر دو را رد می‌کند یا
 * هر دو را می‌پذیرد.
 *
 * پس این لایه فقط بازنویسی‌های آشکار را می‌گیرد (همان مقاله با کلمه‌های مترادف،
 * حدود ۰.۵ به بالا) و بقیه را می‌فرستد جلوی داور. حدی که نمی‌تواند تصمیم بگیرد،
 * نباید وانمود کند که می‌تواند.
 */
export const DUPLICATE_THRESHOLD = 0.55;

/**
 * غربال ایده‌ها — کد، نه مدل.
 *
 * مدل امتیاز داد؛ کد مرتب می‌کند و تکرارهای آشکار را بیرون می‌اندازد. خروجی یک
 * فهرست است نه یک ایده، چون قدم بعدی (داورِ تکرار) ممکن است نفر اول را هم رد کند
 * و ارکستریتور باید نفر دوم را داشته باشد.
 *
 * تابع خالص است و هیچ مدلی صدا نمی‌زند.
 */
export function screenIdeas(
  ideas: Idea[],
  published: TopicDigest[],
  threshold = DUPLICATE_THRESHOLD,
): { fresh: Idea[]; rejected: Duplicate[] } {
  const fresh: Idea[] = [];
  const rejected: Duplicate[] = [];

  for (const idea of [...ideas].sort((a, b) => b.score - a.score)) {
    const closest = closestTopic(idea, published);
    if (closest && closest.similarity >= threshold) {
      rejected.push({
        title: idea.title,
        closest: closest.topic.title,
        similarity: Number(closest.similarity.toFixed(2)),
      });
      continue;
    }
    fresh.push(idea);
  }

  return { fresh, rejected };
}

/** بهترین ایده‌ای که تکراری نیست، یا null اگر همه تکراری بودند. */
export function pickFreshIdea(
  ideas: Idea[],
  published: TopicDigest[],
  threshold = DUPLICATE_THRESHOLD,
): { idea: Idea | null; rejected: Duplicate[] } {
  const { fresh, rejected } = screenIdeas(ideas, published, threshold);
  return { idea: fresh[0] ?? null, rejected };
}

/**
 * نزدیک‌ترین پست‌ها به یک ایده — ورودیِ داورِ تکرار.
 *
 * داور نباید کل کتابخانه را بخواند: پنجاه پست در یک پرامپت یعنی خواندن سرسری و
 * پول بیشتر. سنجه‌ی واژگانی برای همین خوب است — نامزد پیدا کردن، نه قضاوت کردن.
 * پست‌هایی با هم‌پوشانی صفر هم کنار گذاشته می‌شوند تا داور با متن بی‌ربط حواسش
 * پرت نشود.
 */
export function nearestTopics(
  idea: Pick<Idea, "title" | "angle">,
  published: TopicDigest[],
  limit = 3,
): TopicDigest[] {
  return published
    .map((topic) => ({ topic, score: similarity(idea, topic) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.topic);
}
