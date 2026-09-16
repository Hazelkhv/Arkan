import assert from "node:assert/strict";
import { test } from "node:test";

import { extractJsonBlock } from "@/lib/blog/ai";
import { buildSystemPrompt } from "@/lib/blog/agents/lessons";
import { pickBestIdea } from "@/lib/blog/agents/idea-scout";
import {
  DUPLICATE_THRESHOLD,
  nearestTopics,
  pickFreshIdea,
  similarity,
  topicTokens,
  type TopicDigest,
} from "@/lib/blog/agents/novelty";
import { shouldAutoPublish, APPROVE_THRESHOLD } from "@/lib/blog/agents/orchestrator";
import {
  clampToLength,
  ensureH1,
  extractTitle,
  introText,
  runSeoChecks,
  slugify,
  wordCount,
} from "@/lib/blog/agents/seo-checks";
import type { EditorReport, Idea } from "@/lib/blog/agents/types";

/**
 * چیزی که اینجا تست می‌شود، آن قسمتی از سیستم است که «بی‌صدا» خراب می‌شود.
 *
 * اگر یک ایجنت جواب بی‌ربط بدهد، آدم می‌فهمد. ولی اگر استخراج JSON یک کاراکتر
 * اضافه بیاورد، یا دروازه‌ی کیفیت با امتیاز ۷۵ بسته بماند، یا اسلاگ خالی شود —
 * هیچ خطایی بالا نمی‌آید، فقط نتیجه بدتر می‌شود. این توابع خالص‌اند و تست‌شان
 * هیچ توکنی خرج نمی‌کند.
 */

/* ── استخراج JSON ───────────────────────────────────────────────────────── */

test("a fenced JSON object is extracted without the fence", () => {
  const raw = 'Sure! Here you go:\n```json\n{"ideas": [{"title": "a"}]}\n```\nHope that helps.';
  assert.equal(extractJsonBlock(raw), '{"ideas": [{"title": "a"}]}');
});

test("braces inside strings do not end the object early", () => {
  const raw = '{"lesson": "use a } in the text", "agent": "writer"}';
  assert.equal(extractJsonBlock(raw), raw);
  assert.deepEqual(JSON.parse(extractJsonBlock(raw)!), {
    lesson: "use a } in the text",
    agent: "writer",
  });
});

test("an escaped quote does not end the string early", () => {
  const raw = '{"claim": "he said \\"grow slowly\\"", "source": "x"}';
  assert.deepEqual(JSON.parse(extractJsonBlock(raw)!), {
    claim: 'he said "grow slowly"',
    source: "x",
  });
});

test("a top-level array is extracted too", () => {
  assert.equal(extractJsonBlock('prose [1, 2, {"a": 3}] more'), '[1, 2, {"a": 3}]');
});

test("prose with no JSON returns null rather than throwing", () => {
  assert.equal(extractJsonBlock("I cannot help with that request."), null);
});

/* ── دروازه‌ی کیفیت ─────────────────────────────────────────────────────── */

function report(score: number, verdict: EditorReport["verdict"]): EditorReport {
  return { score, verdict, summary: "x".repeat(25), issues: [] };
}

test("a failed blocking SEO check holds an approved article back", () => {
  const approved = report(90, "approve");
  assert.equal(shouldAutoPublish(approved, [{ id: "single-h1" }]), false);
  // کیفیتی، نه انتشاری: جلوی انتشار را نمی‌گیرد.
  assert.equal(shouldAutoPublish(approved, [{ id: "keyword-in-intro" }]), true);
});

test("the quality gate needs both the score and the verdict", () => {
  assert.equal(shouldAutoPublish(report(APPROVE_THRESHOLD, "approve")), true);
  assert.equal(shouldAutoPublish(report(APPROVE_THRESHOLD - 1, "approve")), false);
  // امتیاز بالا با رد صریح ویراستار — مثلاً به‌خاطر آمار جعلی — منتشر نمی‌شود.
  assert.equal(shouldAutoPublish(report(92, "reject")), false);
  assert.equal(shouldAutoPublish(report(92, "revise")), false);
});

/* ── انتخاب ایده ────────────────────────────────────────────────────────── */

/**
 * کمترین چیزی که یک ایده هست.
 *
 * closestExisting و differsFrom برای انتخاب بهترین ایده بی‌اثرند — آن‌ها کار
 * ایده‌یاب‌اند تا تکراری نسازد — ولی چون بخشی از تایپ‌اند، اینجا یک‌بار نوشته
 * می‌شوند تا سه ایده‌ی تست، تفاوتشان فقط همان چیزی باشد که تست درباره‌اش است.
 */
const idea = (title: string, score: number, angle = "x"): Idea => ({
  title,
  angle,
  searchIntent: "how-to",
  score,
  reason: "r",
  closestExisting: null,
  differsFrom: "nothing published covers it",
});

test("the highest-scoring idea wins, and the choice is made in code", () => {
  const ideas: Idea[] = [idea("a", 6), idea("b", 9), idea("c", 8)];
  assert.equal(pickBestIdea(ideas).title, "b");
  // ورودی نباید جابه‌جا شود — گزارش اجرا همان ترتیب مدل را نشان می‌دهد.
  assert.equal(ideas[0].title, "a");
});

/* ── دروازه‌ی تکرار ─────────────────────────────────────────────────────── */

/**
 * این بخش از یک باگ واقعی آمده: دو مقاله‌ی منتشرشده که عنوانشان فرق داشت و
 * حرفشان یکی بود. عددهای این تست‌ها روی همان جفت اندازه‌گیری شده‌اند.
 */
const PUBLISHED: TopicDigest[] = [
  {
    title: "Why Your Marketing Budget Isn't Delivering More Sales",
    excerpt:
      "Many businesses invest heavily in marketing but see stagnant sales. This article explains common reasons for ineffective marketing spend and outlines a strategic approach to drive real growth.",
    keywords: ["marketing budget", "marketing spend", "sales growth"],
  },
  {
    title: "Why your team keeps waiting for you to decide",
    excerpt:
      "Founders of 20-person businesses often mistake a decision bottleneck for a talent problem. The fix is structural, not personal.",
    keywords: ["decision bottleneck", "delegation"],
  },
];

test("the vocabulary every consulting article shares is stripped before comparing", () => {
  // بدون این، «business» و «growth» هر دو مقاله را شبیه هم نشان می‌دهند.
  const tokens = topicTokens("Why your business keeps growing slower than your costs");
  assert.equal(tokens.has("business"), false);
  assert.equal(tokens.has("growing"), false);
  assert.equal(tokens.has("cost"), true);
  // جمع و مفرد یکی شمرده می‌شوند، وگرنه customers با customer برخورد نمی‌کند.
  assert.deepEqual(topicTokens("ideal customers"), topicTokens("ideal customer"));
});

test("a reworded version of a published article is caught without a model", () => {
  const reworded = idea(
    "Why your marketing spend is not producing sales",
    9,
    "Businesses that invest heavily in marketing and still see stagnant sales usually have a strategy problem, not a spend problem.",
  );
  assert.ok(similarity(reworded, PUBLISHED[0]) >= DUPLICATE_THRESHOLD);

  const picked = pickFreshIdea(
    [reworded, idea("What to do when your best salesperson leaves", 7)],
    PUBLISHED,
  );
  assert.equal(picked.idea?.title, "What to do when your best salesperson leaves");
  assert.equal(picked.rejected[0].closest, PUBLISHED[0].title);
});

test("a genuinely different article on the same subject is left to the judge", () => {
  // عمدی: در این ناحیه شباهت واژگانی بین تکرار و نوآوری فرق معناداری نمی‌گذارد،
  // پس کد تصمیم نمی‌گیرد و ایده را می‌فرستد جلوی داور.
  const sameSubject = idea(
    "Which marketing channel to cut first when the budget shrinks",
    9,
    "A practical order of operations for deciding what to stop spending on, based on payback period rather than on which channel feels busiest.",
  );
  assert.ok(similarity(sameSubject, PUBLISHED[0]) < DUPLICATE_THRESHOLD);
  assert.equal(pickFreshIdea([sameSubject], PUBLISHED).idea?.title, sameSubject.title);
});

test("when every idea rewords something, nothing is picked", () => {
  const repeats = [
    idea(
      "Why your marketing spend is not producing sales",
      9,
      "Businesses that invest heavily in marketing and still see stagnant sales usually have a strategy problem, not a spend problem.",
    ),
    idea(
      "Why your team keeps waiting for you to decide things",
      8,
      "Founders of 20-person businesses often mistake a decision bottleneck for a talent problem. The fix is structural.",
    ),
  ];
  const picked = pickFreshIdea(repeats, PUBLISHED);
  assert.equal(picked.idea, null);
  assert.equal(picked.rejected.length, 2);
});

test("the judge is handed the nearest posts, and only the related ones", () => {
  const marketing = idea(
    "Which marketing channel to cut first when the budget shrinks",
    9,
    "Deciding what to stop spending on, based on payback period.",
  );
  const nearest = nearestTopics(marketing, PUBLISHED);
  assert.equal(nearest[0].title, PUBLISHED[0].title);
  // مقاله‌ی بی‌ربط اصلاً جلوی داور نمی‌رود؛ خواندنش فقط پول است.
  assert.equal(nearest.length, 1);
});

test("an empty blog rejects nothing and asks nobody", () => {
  const first = idea("Three signs your business model has stopped working", 8);
  assert.equal(pickFreshIdea([first], []).idea?.title, first.title);
  assert.equal(nearestTopics(first, []).length, 0);
});

/* ── ابزارهای متن ───────────────────────────────────────────────────────── */

const ARTICLE = `# How to unstick a business that stopped growing

Your revenue has been flat for three quarters. A business that stopped growing
rarely looks broken from the inside.

## Where growth actually stalls

Most businesses stall in one of four places.

- Strategy
- Structure

## What to check first

Start with the decisions, not the dashboard.

## Talk it through

Book a free initial conversation.`;

test("the H1 is the title, and headings inside code blocks are ignored", () => {
  assert.equal(extractTitle(ARTICLE), "How to unstick a business that stopped growing");
  assert.equal(extractTitle("```\n# not a title\n```\n# real title"), "real title");
});

test("word count ignores markdown syntax", () => {
  assert.equal(wordCount("## Heading\n\n- **bold** item\n- [link](https://x.co)"), 4);
});

test("the intro excludes the H1 so a keyword in the title does not count twice", () => {
  assert.ok(!introText(ARTICLE).includes("How to unstick"));
  assert.ok(introText(ARTICLE).startsWith("Your revenue has been flat"));
});

test("slugify produces a safe, bounded slug", () => {
  assert.equal(slugify("Why Your Growth Stalled — and What to Do"), "why-your-growth-stalled-and-what-to-do");
  assert.equal(slugify("  Multiple   spaces  "), "multiple-spaces");
  assert.equal(slugify("سلام"), "post", "a slug with no latin characters still has to be a slug");
});

test("over-long metadata is repaired on a word boundary, not rejected", () => {
  const text = "Your revenue has been flat for three quarters and nobody can say why";

  assert.equal(clampToLength(text, 200), text, "text inside the limit is untouched");

  const clamped = clampToLength(text, 40);
  assert.ok(clamped.length <= 40);
  assert.ok(!clamped.endsWith(" "));
  assert.ok(text.startsWith(clamped), "the clamp only cuts, it never rewrites");
  assert.ok(!clamped.includes("quart"), "it does not cut mid-word");
});

/* ── چک‌های قطعی سئو ────────────────────────────────────────────────────── */

const CHECK_INPUT = {
  contentMd: ARTICLE,
  primaryKeyword: "business that stopped growing",
  targetWords: 60,
  metaTitle: "How to unstick a business that stopped growing",
  metaDescription: "x".repeat(140),
  slug: "unstick-a-stalled-business",
  excerpt: "x".repeat(120),
};

function check(id: string, input = CHECK_INPUT) {
  const found = runSeoChecks(input).find((item) => item.id === id);
  assert.ok(found, `check ${id} should exist`);
  return found;
}

test("a well-formed article passes every deterministic check", () => {
  const failures = runSeoChecks(CHECK_INPUT).filter((item) => !item.pass);
  assert.deepEqual(failures.map((item) => item.id), []);
});

test("two H1s are caught", () => {
  assert.equal(
    check("single-h1", { ...CHECK_INPUT, contentMd: `${ARTICLE}\n\n# Second title` }).pass,
    false,
  );
});

test("a keyword missing from the title is caught", () => {
  assert.equal(check("keyword-in-title", { ...CHECK_INPUT, primaryKeyword: "supply chain" }).pass, false);
});

test("meta lengths are bounded on both sides", () => {
  assert.equal(check("meta-description-length", { ...CHECK_INPUT, metaDescription: "short" }).pass, false);
  assert.equal(
    check("meta-description-length", { ...CHECK_INPUT, metaDescription: "x".repeat(200) }).pass,
    false,
  );
});

test("the brand's no-exclamation-marks rule is enforced by code, not by the model", () => {
  assert.equal(check("no-exclamation", { ...CHECK_INPUT, contentMd: `${ARTICLE}\n\nAct now!` }).pass, false);
});

test("a draft that lost its H1 gets the brief's title back", () => {
  const draft = "You have built a successful business.\n\n## Are you spreading yourself thin?\n\nYes.";
  const fixed = ensureH1(draft, "Find Your Profitable Niche");

  assert.equal(extractTitle(fixed), "Find Your Profitable Niche");
  assert.ok(fixed.endsWith(draft), "the repair only prepends, it never rewrites the body");
  assert.deepEqual(
    runSeoChecks({ ...CHECK_INPUT, contentMd: fixed }).find((check) => check.id === "single-h1")
      ?.pass,
    true,
    "the blocking check the repair exists for now passes",
  );
});

test("an article that already has an H1 is left exactly as it was", () => {
  const draft = "# The writer's own title\n\nBody.";
  assert.equal(ensureH1(draft, "The brief's title"), draft);

  const twoH1s = "# One\n\n# Two\n\nBody.";
  assert.equal(
    ensureH1(twoH1s, "The brief's title"),
    twoH1s,
    "two H1s are a human decision, not a repair",
  );
});

test("the restored H1 is a single clean heading line", () => {
  assert.equal(
    ensureH1("Body.", "  # Find   Your\nNiche  "),
    "# Find Your Niche\n\nBody.",
    "a title arriving with its own hash or newlines still produces one H1",
  );
  assert.equal(ensureH1("Body.", "   "), "Body.", "with no title to use, nothing is invented");
});

/* ── حافظه‌ی خودبهبودی ──────────────────────────────────────────────────── */

test("lessons land at the end of the system prompt, numbered", () => {
  const prompt = buildSystemPrompt("You are the writer.", [
    "Open with a concrete situation.",
    "Never cite a figure without a source.",
  ]);

  assert.ok(prompt.startsWith("You are the writer."));
  assert.ok(prompt.includes("The Pillars of Sustainable Growth"), "company context is injected");
  assert.ok(prompt.includes("1. Open with a concrete situation."));
  assert.ok(
    prompt.indexOf("2. Never cite a figure without a source.") > prompt.indexOf("Four Pillars"),
    "lessons come last, where they carry the most weight",
  );
});

test("with no lessons the prompt has no learning section at all", () => {
  const prompt = buildSystemPrompt("You are the editor.", []);
  assert.ok(!prompt.includes("What you learned from previous runs"));
});
