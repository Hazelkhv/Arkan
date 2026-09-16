/**
 * چک‌های قطعی سئو — بخشی از کار که اصلاً نباید به LLM سپرده شود.
 *
 * قاعده‌ی کلی این پروژه: هرچه قابل‌محاسبه است، محاسبه‌اش کن.
 *
 * «طول متا دیسکریپشن ۱۵۵ کاراکتر است یا نه»، «چند تا H1 داریم»، «کلیدواژه در
 * عنوان هست یا نه» — این‌ها شمردنی هستند. اگر از مدل بپرسی، سه چیز بد اتفاق
 * می‌افتد: پول خرج می‌شود، جواب کند می‌آید، و گاهی اشتباه است (مدل‌ها بدنام‌اند در
 * شمردن). کد این را قطعی، رایگان و در چند میکروثانیه جواب می‌دهد.
 *
 * چیزی که برای مدل می‌ماند، قضاوت است: آیا این متا تایتل کسی را وادار به کلیک
 * می‌کند؟ آن را نمی‌شود شمرد. سئوی این سیستم به همین دلیل «نیمه‌قطعی» است.
 *
 * همه‌ی توابع این فایل خالص‌اند و در tests/blog-seo.test.ts تست می‌شوند.
 */

export type SeoCheck = {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
};

/** بلوک‌های کد را حذف می‌کند تا `#` داخلشان با تیتر اشتباه گرفته نشود. */
function withoutCodeBlocks(markdown: string): string {
  return markdown.replace(/```[\s\S]*?```/g, "");
}

export function extractHeadings(markdown: string, level: number): string[] {
  const prefix = "#".repeat(level);
  const pattern = new RegExp(`^${prefix}\\s+(.+)$`, "gm");
  return [...withoutCodeBlocks(markdown).matchAll(pattern)].map((match) =>
    match[1].trim(),
  );
}

export function extractTitle(markdown: string): string {
  return extractHeadings(markdown, 1)[0] ?? "";
}

/** متن ساده‌ی مقاله — برای شمارش کلمه و جستجوی کلیدواژه. */
export function toPlainText(markdown: string): string {
  return withoutCodeBlocks(markdown)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function wordCount(markdown: string): number {
  const text = toPlainText(markdown);
  return text ? text.split(" ").filter(Boolean).length : 0;
}

/** اولین ۶۰۰ کاراکترِ بدنه، بعد از H1 — «مقدمه» برای چک کلیدواژه. */
export function introText(markdown: string): string {
  const body = withoutCodeBlocks(markdown).replace(/^#\s+.+$/m, "");
  return toPlainText(body).slice(0, 600);
}

/**
 * اسلاگ امن: حروف کوچک، فقط a–z و ۰–۹ و خط تیره، حداکثر ۸ کلمه.
 *
 * چرا سقف کلمه؟ اسلاگ بلند نه برای کاربر خواناست نه برای موتور جستجو مفید، و
 * مدل‌ها بدون قید، کل عنوان را اسلاگ می‌کنند.
 */
export function slugify(input: string, maxWords = 8): string {
  const words = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean);
  return words.slice(0, maxWords).join("-").slice(0, 80) || "post";
}

/**
 * کوتاه کردن متن تا سقف، روی مرز کلمه.
 *
 * نرمال‌سازی است نه اعتبارسنجی: چیزی که می‌شود تعمیرش کرد نباید باعث شکست شود.
 * بدون نقطه‌چین، چون متا دیسکریپشنِ نصفه با «...» بدتر از جمله‌ی کوتاه‌شده است.
 */
export function clampToLength(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;

  const cut = trimmed.slice(0, max + 1);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut.slice(0, max))
    .replace(/[\s,;:—-]+$/, "")
    .trim();
}

function includesKeyword(haystack: string, keyword: string): boolean {
  return haystack.toLowerCase().includes(keyword.toLowerCase().trim());
}

export type SeoCheckInput = {
  contentMd: string;
  primaryKeyword: string;
  targetWords: number;
  metaTitle: string;
  metaDescription: string;
  slug: string;
  excerpt: string;
};

export function runSeoChecks(input: SeoCheckInput): SeoCheck[] {
  const title = extractTitle(input.contentMd);
  const h1Count = extractHeadings(input.contentMd, 1).length;
  const h2Count = extractHeadings(input.contentMd, 2).length;
  const words = wordCount(input.contentMd);
  const intro = introText(input.contentMd);
  const plain = toPlainText(input.contentMd);

  // ±۲۵٪ حول طول هدف. سخت‌گیرتر از این، هر مقاله‌ای را رد می‌کند؛ شل‌تر، بی‌معنی است.
  const minWords = Math.round(input.targetWords * 0.75);
  const maxWords = Math.round(input.targetWords * 1.25);

  return [
    {
      id: "single-h1",
      label: "Exactly one H1",
      pass: h1Count === 1,
      detail: `${h1Count} found`,
    },
    {
      id: "has-sections",
      label: "At least three H2 sections",
      pass: h2Count >= 3,
      detail: `${h2Count} found`,
    },
    {
      id: "keyword-in-title",
      label: "Primary keyword in the H1",
      pass: includesKeyword(title, input.primaryKeyword),
      detail: title || "(no H1)",
    },
    {
      id: "keyword-in-intro",
      label: "Primary keyword in the opening",
      pass: includesKeyword(intro, input.primaryKeyword),
      detail: `first ${intro.length} characters checked`,
    },
    {
      id: "keyword-in-meta",
      label: "Primary keyword in the meta title",
      pass: includesKeyword(input.metaTitle, input.primaryKeyword),
      detail: input.metaTitle,
    },
    {
      id: "meta-title-length",
      label: "Meta title 30–60 characters",
      pass: input.metaTitle.length >= 30 && input.metaTitle.length <= 60,
      detail: `${input.metaTitle.length} characters`,
    },
    {
      id: "meta-description-length",
      label: "Meta description 120–160 characters",
      pass:
        input.metaDescription.length >= 120 && input.metaDescription.length <= 160,
      detail: `${input.metaDescription.length} characters`,
    },
    {
      id: "excerpt-length",
      label: "Excerpt 80–220 characters",
      pass: input.excerpt.length >= 80 && input.excerpt.length <= 220,
      detail: `${input.excerpt.length} characters`,
    },
    {
      id: "slug-shape",
      label: "Slug is lowercase kebab-case, at most 8 words",
      pass:
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug) &&
        input.slug.split("-").length <= 8,
      detail: input.slug,
    },
    {
      id: "word-count",
      label: `Length within 25% of the ${input.targetWords}-word target`,
      pass: words >= minWords && words <= maxWords,
      detail: `${words} words (target ${minWords}–${maxWords})`,
    },
    {
      // قاعده‌ی برند، نه سئو — ولی شمردنی است، پس جایش همین‌جاست.
      id: "no-exclamation",
      label: "No exclamation marks",
      pass: !plain.includes("!"),
      detail: plain.includes("!") ? "at least one found" : "none",
    },
  ];
}

export function failedChecks(checks: SeoCheck[]): SeoCheck[] {
  return checks.filter((check) => !check.pass);
}
