/**
 * تست مستقل ایجنت‌ها، بدون بالا آوردن Next و بدون دیتابیس.
 *
 *   npm run blog:agent -- idea
 *   npm run blog:agent -- strategist
 *   npm run blog:agent -- researcher
 *   npm run blog:agent -- writer
 *   npm run blog:agent -- editor
 *   npm run blog:agent -- seo
 *   npm run blog:agent -- critic
 *   npm run blog:agent -- pipeline --hint "pricing"
 *
 * چرا این فایل وجود دارد؟ چون تنها راه فهمیدن اینکه یک ایجنت واقعاً کارش را
 * بلد است، دیدن خروجی خودش است — نه دیدن مقاله‌ی نهایی. وقتی هشت ایجنت پشت سر
 * هم اجرا شوند و نتیجه بد باشد، هیچ‌کس نمی‌داند کدامشان مقصر بوده.
 *
 * هر ایجنت با یک ورودی ثابت (fixture) صدا زده می‌شود، پس می‌شود دوبار اجرا کرد و
 * خروجی‌ها را مقایسه کرد.
 */

import { runIdeaScout, pickBestIdea } from "@/lib/blog/agents/idea-scout";
import { runStrategist } from "@/lib/blog/agents/strategist";
import { runResearcher } from "@/lib/blog/agents/researcher";
import { runWriter } from "@/lib/blog/agents/writer";
import { runEditor } from "@/lib/blog/agents/editor";
import { runSeo } from "@/lib/blog/agents/seo";
import { runCritic } from "@/lib/blog/agents/critic";
import { runPipeline } from "@/lib/blog/agents/orchestrator";
import type { Brief, Idea, Research } from "@/lib/blog/agents/types";

// حالت پیش‌فرض: حافظه. کلیدهای Supabase عمداً کنار گذاشته می‌شوند تا این اسکریپت
// هیچ‌وقت به دیتابیس واقعی چیزی ننویسد. با `--db` می‌شود اجازه داد.
if (!process.argv.includes("--db")) {
  delete process.env.SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
}

const args = process.argv.slice(2);
const command = args[0] ?? "pipeline";
const hintIndex = args.indexOf("--hint");
const hint = hintIndex === -1 ? null : args[hintIndex + 1];

const trace = (t: { agent: string; model: string; ms: number; outputTokens?: number }) =>
  console.log(
    `   ↳ ${t.agent} · ${t.model} · ${t.ms}ms · ${t.outputTokens ?? "?"} output tokens`,
  );

/* ── fixtureها: ورودی ثابت برای ایجنت‌های میانی ──────────────────────────── */

const FIXTURE_IDEA: Idea = {
  title: "Why your team keeps waiting for you to decide",
  angle:
    "Founders of 20-person businesses often mistake a decision bottleneck for a talent problem. The fix is structural, not personal.",
  searchIntent: "informational",
  score: 9,
  reason: "Names a daily, recognisable symptom and leads straight to structure work.",
};

const FIXTURE_BRIEF: Brief = {
  title: "Why your team keeps waiting for you to decide",
  audience:
    "A founder of a 15–40 person business who is still the final approver on most decisions and cannot find time for strategy.",
  promise:
    "The reader can tell whether their bottleneck is a people problem or a structure problem, and knows the first change to make.",
  primaryKeyword: "decision bottleneck",
  secondaryKeywords: [
    "delegation",
    "business structure",
    "founder bottleneck",
    "decision rights",
  ],
  outline: [
    {
      heading: "The symptom everyone misreads",
      points: ["Work stops when you are away", "You call it a hiring problem"],
    },
    {
      heading: "Where decisions actually get stuck",
      points: ["Undefined decision rights", "No agreed thresholds", "Escalation by habit"],
    },
    {
      heading: "A first change that costs nothing",
      points: ["Write down who decides what", "Set a value threshold", "Review in 30 days"],
    },
    {
      heading: "When it is worth bringing someone in",
      points: ["Repeated escalation", "Growth stalled for two quarters"],
    },
  ],
  targetWords: 1100,
  cta: "If your decisions keep coming back to you, a free initial conversation is a good place to start.",
};

const FIXTURE_RESEARCH: Research = {
  queries: ["founder decision bottleneck", "decision rights SME"],
  facts: [
    { claim: "Decision rights are rarely written down in businesses under 50 people." },
    { claim: "Escalation is usually habit, not policy — nobody ever removed the step." },
    { claim: "Growth stalls when approval throughput, not demand, is the limit." },
  ],
  examples: [
    "A 30-person workshop where every purchase over a small amount still reaches the founder.",
    "A services firm whose account managers ask before every discount, because no threshold exists.",
  ],
  commonQuestions: [
    "Is this a hiring problem or a structure problem?",
    "How do I delegate without losing quality?",
    "What should I keep deciding myself?",
  ],
  angleNotes:
    "Stay practical and non-judgemental. The reader is not doing anything wrong; the structure simply never changed as the business grew.",
};

const FIXTURE_DRAFT = `# Why your team keeps waiting for you to decide

Your week is full of approvals. Nothing moves while you are away.

## The symptom everyone misreads

Most founders read this as a people problem.

## Where decisions actually get stuck

Nobody ever wrote down who decides what.

## A first change that costs nothing

Write the list. Set a threshold. Review it in thirty days.

## Talk it through

If your decisions keep coming back to you, a free initial conversation is a good place to start.`;

/* ── اجرا ────────────────────────────────────────────────────────────────── */

async function main() {
  switch (command) {
    case "idea": {
      const result = await runIdeaScout({
        recentTitles: ["Three signs your business model has stopped working"],
        topicHint: hint,
        onTrace: trace,
      });
      console.dir(result.ideas, { depth: null });
      console.log("\nBest:", pickBestIdea(result.ideas).title);
      break;
    }
    case "strategist":
      console.dir(await runStrategist({ idea: FIXTURE_IDEA, onTrace: trace }), {
        depth: null,
      });
      break;
    case "researcher":
      console.dir(await runResearcher({ brief: FIXTURE_BRIEF, onTrace: trace }), {
        depth: null,
      });
      break;
    case "writer":
      console.log(
        await runWriter({
          brief: FIXTURE_BRIEF,
          research: FIXTURE_RESEARCH,
          onTrace: trace,
        }),
      );
      break;
    case "editor":
      console.dir(
        await runEditor({ brief: FIXTURE_BRIEF, draft: FIXTURE_DRAFT, round: 1, onTrace: trace }),
        { depth: null },
      );
      break;
    case "seo":
      console.dir(
        await runSeo({ brief: FIXTURE_BRIEF, contentMd: FIXTURE_DRAFT, onTrace: trace }),
        { depth: null },
      );
      break;
    case "critic":
      console.dir(
        await runCritic({
          briefTitle: FIXTURE_BRIEF.title,
          editorReports: [
            {
              score: 68,
              verdict: "revise",
              summary: "Reads well but opens with a definition and never names the reader's situation.",
              issues: [
                {
                  severity: "major",
                  area: "voice",
                  problem: "The opening is generic.",
                  fix: "Open with the reader's week.",
                },
              ],
            },
          ],
          revisionRounds: 1,
          seoFailures: [],
          finalArticle: FIXTURE_DRAFT,
          published: false,
          onTrace: trace,
        }),
        { depth: null },
      );
      break;
    case "pipeline": {
      const { run, post } = await runPipeline({ topicHint: hint });
      for (const step of run.steps) {
        console.log(
          `${step.status === "error" ? "✖" : "✔"} ${step.agent.padEnd(12)} ${step.label}\n   ${
            step.summary ?? step.error ?? ""
          }`,
        );
      }
      console.log(`\nRun ${run.status}. Post: ${post ? `${post.status} · /blog/${post.slug}` : "none"}`);
      break;
    }
    default:
      console.error(`Unknown command "${command}".`);
      process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
