import { z } from "zod";

/**
 * قرارداد خروجی ایجنت‌ها.
 *
 * خروجی هر ایجنت، ورودی ایجنت بعدی است. در کد معمولی این را با interface حل
 * می‌کنیم، ولی اینجا تولیدکننده‌ی داده یک مدل زبانی است که هیچ تعهدی به تایپ‌های
 * TypeScript ندارد — TypeScript در زمان اجرا وجود ندارد. پس قرارداد باید در زمان
 * اجرا قابل اعتبارسنجی باشد: Zod.
 *
 * فایده‌ی عملی: اگر پژوهشگر یک فیلد را جا بیندازد، خطا همان‌جا با پیام روشن بالا
 * می‌آید — نه سه گام بعد داخل نویسنده، به‌شکل یک مقاله‌ی بی‌ربط.
 *
 * تایپ‌های TypeScript از همین اسکیماها استنتاج می‌شوند (z.infer) تا هرگز دو
 * تعریف موازی نداشته باشیم که از هم عقب بیفتند.
 */

/** هر درسِ خودبهبودی خطاب به یکی از این‌هاست. */
export const AGENT_NAMES = [
  "idea-scout",
  "strategist",
  "researcher",
  "writer",
  "editor",
  "seo",
  "critic",
] as const;

export const AgentNameSchema = z.enum(AGENT_NAMES);
export type AgentName = z.infer<typeof AgentNameSchema>;

/* ── ۱. ایده‌یاب ─────────────────────────────────────────────────────────── */

export const IdeaSchema = z.object({
  title: z.string().min(10).max(120),
  angle: z.string().min(20),
  /** نیت جستجوی خواننده — استراتژیست از روی آن ساختار مقاله را می‌چیند. */
  searchIntent: z.enum(["informational", "commercial", "comparison", "how-to"]),
  score: z.number().min(0).max(10),
  reason: z.string().min(10),
});
export type Idea = z.infer<typeof IdeaSchema>;

/** حداقل سه ایده، تا ارکستریتور واقعاً چیزی برای انتخاب کردن داشته باشد. */
export const IdeaListSchema = z.object({
  ideas: z.array(IdeaSchema).min(3),
});
export type IdeaList = z.infer<typeof IdeaListSchema>;

/* ── ۲. استراتژیست ──────────────────────────────────────────────────────── */

export const OutlineSectionSchema = z.object({
  heading: z.string().min(3),
  points: z.array(z.string().min(3)).min(1),
});

export const BriefSchema = z.object({
  title: z.string().min(10),
  audience: z.string().min(20),
  /** قولی که مقاله به خواننده می‌دهد؛ ویراستار دقیقاً همین را می‌سنجد. */
  promise: z.string().min(20),
  primaryKeyword: z.string().min(3),
  secondaryKeywords: z.array(z.string().min(2)).min(2).max(8),
  outline: z.array(OutlineSectionSchema).min(3),
  targetWords: z.number().int().min(600).max(2500),
  cta: z.string().min(10),
});
export type Brief = z.infer<typeof BriefSchema>;

/* ── ۳. پژوهشگر ─────────────────────────────────────────────────────────── */

export const ResearchSchema = z.object({
  /** کوئری‌هایی که مدل ساخت — الگوی «مدل تصمیم می‌گیرد، کد اجرا می‌کند». */
  queries: z.array(z.string().min(3)).max(6),
  facts: z
    .array(
      z.object({
        claim: z.string().min(10),
        /** اگر منبعی نبود، نویسنده حق ندارد آن را به‌عنوان واقعیت اندازه‌گیری‌شده بنویسد. */
        source: z.string().optional(),
      }),
    )
    .min(3),
  examples: z.array(z.string().min(15)).min(2),
  commonQuestions: z.array(z.string().min(8)).min(3),
  angleNotes: z.string().min(20),
});
export type Research = z.infer<typeof ResearchSchema>;

/* ── ۵. ویراستار ────────────────────────────────────────────────────────── */

export const EditorIssueSchema = z.object({
  severity: z.enum(["blocker", "major", "minor"]),
  area: z.enum(["brief-fit", "voice", "structure", "accuracy", "cta", "clarity"]),
  problem: z.string().min(10),
  /** ایراد بدون راه‌حل، به نویسنده کمکی نمی‌کند. */
  fix: z.string().min(10),
});

export const EditorReportSchema = z.object({
  score: z.number().min(0).max(100),
  verdict: z.enum(["approve", "revise", "reject"]),
  summary: z.string().min(20),
  issues: z.array(EditorIssueSchema),
});
export type EditorReport = z.infer<typeof EditorReportSchema>;
export type EditorIssue = z.infer<typeof EditorIssueSchema>;

/* ── ۶. متخصص سئو ───────────────────────────────────────────────────────── */

/**
 * سقف‌ها اینجا عمداً گشاد هستند.
 *
 * اولین نسخه‌ی این اسکیما متا دیسکریپشن را روی ۱۶۵ کاراکتر می‌بست و نتیجه این شد
 * که یک توضیحِ ۱۶۸ کاراکتری، بعد از شش گام موفق، کل اجرا را از بین برد. درسِ
 * طراحی: اعتبارسنجی برای چیزی است که نمی‌شود تعمیرش کرد. طول متن قابل تعمیر است،
 * پس کد کوتاهش می‌کند (seo.ts) و چکِ قطعی گزارش می‌دهد که آیا در بازه‌ی ایده‌آل
 * بوده یا نه. اسکیما فقط جلوی چیزهای بی‌معنا را می‌گیرد، نه چیزهای غیربهینه.
 */
export const SeoResultSchema = z.object({
  /** شکل نهایی اسلاگ را slugify تضمین می‌کند، پس اینجا سخت‌گیری بی‌فایده است. */
  slug: z.string().min(3),
  metaTitle: z.string().min(20).max(120),
  metaDescription: z.string().min(70).max(400),
  excerpt: z.string().min(60).max(500),
  keywords: z.array(z.string().min(2)).min(3).max(10),
  /** ورودی JSON-LD از نوع FAQPage در صفحه‌ی مقاله. */
  faq: z
    .array(
      z.object({
        question: z.string().min(8),
        answer: z.string().min(30),
      }),
    )
    .min(2)
    .max(6),
});
export type SeoResult = z.infer<typeof SeoResultSchema>;

/* ── ۸. منتقد ───────────────────────────────────────────────────────────── */

export const LessonDraftSchema = z.object({
  agent: AgentNameSchema,
  lesson: z.string().min(20).max(300),
});

/**
 * سقف سه درس در هر اجرا — عمدی است. اگر منتقد اجازه داشته باشد پانزده درس بدهد،
 * حافظه‌ی ایجنت‌ها ظرف چند اجرا پر از توصیه‌های کلی می‌شود و پرامپت را رقیق می‌کند.
 * محدودیت، منتقد را وادار می‌کند مهم‌ترین‌ها را انتخاب کند.
 */
export const CriticResultSchema = z.object({
  lessons: z.array(LessonDraftSchema).max(3),
});
export type CriticResult = z.infer<typeof CriticResultSchema>;
export type LessonDraft = z.infer<typeof LessonDraftSchema>;
