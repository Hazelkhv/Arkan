import { AgentError, type AgentTrace } from "@/lib/blog/ai";
import { pickBestIdea, runIdeaScout } from "@/lib/blog/agents/idea-scout";
import { runStrategist } from "@/lib/blog/agents/strategist";
import { runResearcher } from "@/lib/blog/agents/researcher";
import { runWriter, runWriterRevision } from "@/lib/blog/agents/writer";
import { runEditor } from "@/lib/blog/agents/editor";
import { runSeo } from "@/lib/blog/agents/seo";
import { runCritic } from "@/lib/blog/agents/critic";
import { recordLessons } from "@/lib/blog/agents/lessons";
import { extractTitle, wordCount } from "@/lib/blog/agents/seo-checks";
import { getStore } from "@/lib/blog/store";
import type {
  BlogStore,
  PipelineStep,
  PostRecord,
  RunRecord,
} from "@/lib/blog/store/types";
import type { Brief, EditorReport, Research } from "@/lib/blog/agents/types";

/**
 * ارکستریتور — مهم‌ترین فایل این پروژه، و تنها فایلی که در آن هیچ LLM‌ای نیست.
 *
 * رایج‌ترین اشتباه در ساخت سیستم مولتی‌ایجنت این است که خودِ جریان کار را هم به
 * یک LLM «مدیر» بسپاریم: مدلی که تصمیم می‌گیرد بعدی چه کسی است و کِی تمام شود.
 * وسوسه‌انگیز است، چون انعطاف‌پذیر به‌نظر می‌رسد. ولی جریان کار باید سه ویژگی
 * داشته باشد که هیچ‌کدام از خصوصیات مدل نیست:
 *
 *   قابل پیش‌بینی — دو اجرا با ورودی یکسان باید یک مسیر را بروند.
 *   قابل دیباگ    — وقتی خراب شد، باید بشود گفت دقیقاً کجا.
 *   قابل تست      — دروازه‌ی کیفیت را باید بدون خرج کردن توکن تست کرد.
 *
 * پس مرز این است:
 *   تصمیم‌های خلاقانه (چه بنویسیم، چطور بنویسیم، خوب است یا نه) → ایجنت‌ها
 *   جریان کار (ترتیب، حلقه، شرط، ثبت وضعیت، خطا)               → همین فایل
 */

/** زیر این امتیاز، مقاله برمی‌گردد به نویسنده. */
export const APPROVE_THRESHOLD = 75;

/**
 * سقف دو دور بازنویسی.
 *
 * چرا سقف لازم است؟ چون هیچ تضمینی نیست که ویراستار و نویسنده به توافق برسند.
 * بدون سقف، یک مقاله‌ی بد می‌تواند تا ابد بین دو مدل رفت‌وبرگشت کند و کیف پول را
 * خالی کند. بعد از سقف، تصمیم به انسان واگذار می‌شود — که پاسخ درستِ «سیستم
 * نتوانست» است، نه انتشار چیزی که خودش هم قبولش ندارد.
 */
export const MAX_REVISION_ROUNDS = 2;

/**
 * چک‌های قطعی‌ای که شکستشان جلوی انتشار خودکار را می‌گیرد.
 *
 * چرا همه‌ی چک‌ها نه؟ چون «کلیدواژه در مقدمه نیامده» یک نقص کیفی است، نه یک
 * نقص انتشار؛ اگر آن هم مسدودکننده باشد، عملاً هیچ مقاله‌ای خودکار منتشر نمی‌شود
 * و دروازه بی‌معنا می‌شود. این سه مورد فرق دارند: دو تیتر اصلی و اسلاگ خراب،
 * صفحه‌ی منتشرشده را واقعاً خراب می‌کنند، و علامت تعجب یک قاعده‌ی صریح برند است.
 */
export const BLOCKING_CHECKS = ["single-h1", "slug-shape", "no-exclamation"];

/**
 * دروازه‌ی انتشار. تابع خالص است تا بدون صدا زدن هیچ مدلی تست شود.
 *
 * سه شرط لازم‌اند: امتیاز عددی برای کیفیت کلی، verdict برای خط‌قرمزهایی که عدد
 * نشانشان نمی‌دهد (مقاله‌ای که ۸۲ گرفته ولی یک آمار جعلی دارد)، و چک‌های قطعی
 * برای چیزهایی که اصلاً قضاوت نیستند.
 */
export function shouldAutoPublish(
  report: EditorReport,
  failedChecks: Array<{ id: string }> = [],
): boolean {
  const blocked = failedChecks.some((check) => BLOCKING_CHECKS.includes(check.id));
  return report.score >= APPROVE_THRESHOLD && report.verdict === "approve" && !blocked;
}

/** اسلاگ یکتا. ستون slug در دیتابیس unique است؛ برخورد را اینجا حل می‌کنیم. */
export async function ensureUniqueSlug(
  store: BlogStore,
  slug: string,
): Promise<string> {
  let candidate = slug;
  for (let suffix = 2; suffix < 50; suffix++) {
    const existing = await store.getPostBySlug(candidate);
    if (!existing) return candidate;
    candidate = `${slug}-${suffix}`;
  }
  return `${slug}-${Date.now()}`;
}

/**
 * ثبت وضعیت در store، نه در حافظه.
 *
 * هر گام بلافاصله بعد از شروع و بعد از پایان ذخیره می‌شود. دلیلش فقط نمایش زنده
 * در استودیو نیست: روی Vercel، درخواستی که پایپ‌لاین را شروع کرده ممکن است
 * قطع شود یا روی instance دیگری ادامه پیدا کند. چیزی که ننوشته‌ای، وجود ندارد.
 */
class RunLog {
  private steps: PipelineStep[] = [];

  constructor(
    private readonly store: BlogStore,
    private readonly runId: string,
  ) {}

  snapshot(): PipelineStep[] {
    return this.steps;
  }

  async step<T>(
    agent: string,
    label: string,
    work: (onTrace: (trace: AgentTrace) => void) => Promise<T>,
    summarise: (result: T) => string,
  ): Promise<T> {
    const step: PipelineStep = {
      agent,
      label,
      status: "running",
      startedAt: new Date().toISOString(),
    };
    this.steps.push(step);
    await this.persist();

    const traces: AgentTrace[] = [];
    const startedAt = Date.now();

    try {
      const result = await work((trace) => traces.push(trace));
      step.status = "done";
      step.summary = summarise(result);
      step.model = traces[0]?.model;
      step.inputTokens = traces.reduce((sum, t) => sum + (t.inputTokens ?? 0), 0);
      step.outputTokens = traces.reduce((sum, t) => sum + (t.outputTokens ?? 0), 0);
      step.ms = Date.now() - startedAt;
      step.finishedAt = new Date().toISOString();
      await this.persist();
      return result;
    } catch (error) {
      step.status = "error";
      step.error = error instanceof Error ? error.message : String(error);
      step.ms = Date.now() - startedAt;
      step.finishedAt = new Date().toISOString();
      await this.persist();
      throw error;
    }
  }

  /** گامی که کارش کد است، نه مدل — ناشر و دروازه‌ها. */
  async note(agent: string, label: string, summary: string, detail?: unknown) {
    const now = new Date().toISOString();
    this.steps.push({
      agent,
      label,
      status: "done",
      startedAt: now,
      finishedAt: now,
      summary,
      detail,
    });
    await this.persist();
  }

  private async persist() {
    await this.store.updateRun(this.runId, { steps: this.steps });
  }
}

export type PipelineResult = {
  run: RunRecord;
  post: PostRecord | null;
};

/**
 * یک اجرای کامل:
 *
 *   ایده‌یاب → استراتژیست → پژوهشگر → نویسنده ⇄ ویراستار → سئو → ناشر → منتقد
 *
 * فقط فلش دوطرفه بین نویسنده و ویراستار حلقه است؛ بقیه خطی است.
 */
export async function runPipeline(options: {
  topicHint?: string | null;
  runId?: string;
}): Promise<PipelineResult> {
  const store = getStore();
  const run = options.runId
    ? await store.getRun(options.runId)
    : await store.createRun(options.topicHint?.trim() || null);

  if (!run) throw new Error(`Run ${options.runId} not found`);

  const log = new RunLog(store, run.id);
  let post: PostRecord | null = null;

  try {
    /* ── ۱. ایده‌یاب ─────────────────────────────────────────────────────── */
    const recent = await store.listPosts({ limit: 20 });
    const ideas = await log.step(
      "idea-scout",
      "Finding topics worth writing about",
      (onTrace) =>
        runIdeaScout({
          recentTitles: recent.map((item) => item.title),
          topicHint: run.topicHint,
          onTrace,
        }),
      (result) =>
        `${result.ideas.length} ideas — best: "${pickBestIdea(result.ideas).title}" (${
          pickBestIdea(result.ideas).score
        }/10)`,
    );

    // انتخاب، کارِ کد است. مدل امتیاز داد؛ ما مرتب می‌کنیم.
    const idea = pickBestIdea(ideas.ideas);

    /* ── ۲. استراتژیست ──────────────────────────────────────────────────── */
    const brief: Brief = await log.step(
      "strategist",
      "Turning the idea into a content brief",
      (onTrace) => runStrategist({ idea, onTrace }),
      (result) =>
        `"${result.title}" · ${result.outline.length} sections · ~${result.targetWords} words · keyword "${result.primaryKeyword}"`,
    );

    /* ── ۳. پژوهشگر ─────────────────────────────────────────────────────── */
    const research: Research = await log.step(
      "researcher",
      "Gathering facts, examples and reader questions",
      (onTrace) => runResearcher({ brief, onTrace }),
      (result) =>
        `${result.facts.length} facts (${
          result.facts.filter((fact) => fact.source).length
        } sourced) · ${result.examples.length} examples · ${result.commonQuestions.length} questions`,
    );

    /* ── ۴+۵. نویسنده ⇄ ویراستار ─────────────────────────────────────────── */
    let draft = await log.step(
      "writer",
      "Writing the first draft",
      (onTrace) => runWriter({ brief, research, onTrace }),
      (result) => `${wordCount(result)} words`,
    );

    const reports: EditorReport[] = [];
    let report = await log.step(
      "editor",
      "Reviewing the draft",
      (onTrace) => runEditor({ brief, draft, round: 1, onTrace }),
      (result) =>
        `${result.score}/100 · ${result.verdict} · ${result.issues.length} issues`,
    );
    reports.push(report);

    // دروازه‌ی کیفیت. شرطِ کد، نه قضاوت مدل: مدل عدد داد، کد تصمیم می‌گیرد.
    let revisions = 0;
    while (!shouldAutoPublish(report) && revisions < MAX_REVISION_ROUNDS) {
      revisions++;
      const round = revisions;

      // پیام باید دلیل واقعی را بگوید: امتیازِ کم و verdictِ غیرتأیید دو شرط
      // جداگانه‌اند و یک اجرا می‌تواند فقط به‌خاطر دومی به بازنویسی برود.
      const reason =
        report.score < APPROVE_THRESHOLD
          ? `scored ${report.score}/100, below ${APPROVE_THRESHOLD}`
          : `scored ${report.score}/100 but the editor's verdict is "${report.verdict}"`;

      await log.note(
        "orchestrator",
        `Quality gate: ${reason}`,
        `Sending it back for revision ${round} of ${MAX_REVISION_ROUNDS}`,
      );

      const previousDraft = draft;
      const previousReport = report;
      draft = await log.step(
        "writer",
        `Revision ${round}`,
        (onTrace) =>
          runWriterRevision({
            brief,
            research,
            draft: previousDraft,
            report: previousReport,
            onTrace,
          }),
        (result) => `${wordCount(result)} words`,
      );

      report = await log.step(
        "editor",
        `Reviewing revision ${round}`,
        (onTrace) =>
          runEditor({
            brief,
            draft,
            round: round + 1,
            previousReport,
            onTrace,
          }),
        (result) =>
          `${result.score}/100 · ${result.verdict} · ${result.issues.length} issues`,
      );
      reports.push(report);
    }

    /* ── ۶. سئو ─────────────────────────────────────────────────────────── */
    const seoOutcome = await log.step(
      "seo",
      "Packaging metadata and running the deterministic checks",
      (onTrace) => runSeo({ brief, contentMd: draft, onTrace }),
      (result) =>
        `/${result.seo.slug} · ${result.checks.length - result.failed.length}/${
          result.checks.length
        } checks passed`,
    );

    /* ── ۷. ناشر ────────────────────────────────────────────────────────── */
    // این گام LLM نیست. یک شرط و یک insert.
    const autoPublish = shouldAutoPublish(report, seoOutcome.failed);
    const slug = await ensureUniqueSlug(store, seoOutcome.seo.slug);

    post = await store.createPost({
      runId: run.id,
      title: extractTitle(draft) || brief.title,
      slug,
      excerpt: seoOutcome.seo.excerpt,
      contentMd: draft,
      metaTitle: seoOutcome.seo.metaTitle,
      metaDescription: seoOutcome.seo.metaDescription,
      keywords: seoOutcome.seo.keywords,
      faq: seoOutcome.seo.faq,
      score: report.score,
      status: autoPublish ? "published" : "draft",
      publishedAt: autoPublish ? new Date().toISOString() : null,
    });

    await log.note(
      "publisher",
      autoPublish ? "Published" : "Held as a draft",
      autoPublish
        ? `Scored ${report.score}/100 and approved — published at /blog/${slug}`
        : `Scored ${report.score}/100 after ${revisions} revision(s)${
            seoOutcome.failed.some((check) => BLOCKING_CHECKS.includes(check.id))
              ? `, and a blocking SEO check failed`
              : ""
          } — waiting for a human decision in the studio`,
      { postId: post.id, slug, failedChecks: seoOutcome.failed },
    );

    await store.updateRun(run.id, { postId: post.id });

    /* ── ۸. منتقد ───────────────────────────────────────────────────────── */
    // نقد بعد از انتشار می‌آید: نتیجه‌ی نهایی، بخشی از چیزی است که نقد می‌شود.
    const critique = await log.step(
      "critic",
      "Extracting lessons for the next run",
      (onTrace) =>
        runCritic({
          briefTitle: brief.title,
          editorReports: reports,
          revisionRounds: revisions,
          seoFailures: seoOutcome.failed,
          finalArticle: draft,
          published: autoPublish,
          onTrace,
        }),
      (result) =>
        result.lessons.length === 0
          ? "No new lessons — the run went cleanly"
          : result.lessons.map((lesson) => `${lesson.agent}: ${lesson.lesson}`).join(" · "),
    );

    await recordLessons(critique.lessons, "critic");

    const finished = await store.updateRun(run.id, {
      status: "done",
      finishedAt: new Date().toISOString(),
    });
    return { run: finished, post };
  } catch (error) {
    /**
     * خطای یک ایجنت، کل اجرا را متوقف می‌کند — عمدی است. اگر پژوهشگر شکست بخورد و
     * ما بی‌خیال ادامه دهیم، نویسنده با دست خالی می‌نویسد و نتیجه‌اش مقاله‌ای است
     * که «به‌نظر درست می‌آید». شکست پر سر و صدا بهتر از موفقیت ساختگی است.
     */
    const message =
      error instanceof AgentError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);

    const failed = await store.updateRun(run.id, {
      status: "error",
      error: message,
      finishedAt: new Date().toISOString(),
    });
    console.error("[blog] pipeline failed:", message);
    return { run: failed, post };
  }
}
