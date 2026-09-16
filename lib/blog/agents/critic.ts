import { runAgentJSON, type AgentTrace } from "@/lib/blog/ai";
import { systemPromptFor } from "@/lib/blog/agents/lessons";
import {
  AGENT_NAMES,
  CriticResultSchema,
  type CriticResult,
  type EditorReport,
} from "@/lib/blog/agents/types";
import type { SeoCheck } from "@/lib/blog/agents/seo-checks";

/**
 * ایجنت ۸ — منتقد. موتور خودبهبودی.
 *
 * تفاوتش با ویراستار مهم است و راحت گم می‌شود:
 *   ویراستار «این مقاله» را قضاوت می‌کند → نتیجه‌اش بازنویسیِ همین مقاله است.
 *   منتقد «این اجرا» را قضاوت می‌کند    → نتیجه‌اش تغییر رفتار در اجراهای بعدی است.
 *
 * ورودی‌اش گزارش کل فرایند است: امتیاز ویراستار، تعداد دورهای بازنویسی، چک‌های
 * سئوی ردشده و خود متن. خروجی‌اش حداکثر سه درس، و هر درس خطاب به یک ایجنت مشخص.
 *
 * چرا «خطاب به یک ایجنت مشخص»؟ چون درس باید به system prompt همان ایجنت تزریق
 * شود. توصیه‌ی «مقاله‌ها باید ملموس‌تر باشند» جایی برای نشستن ندارد؛
 * «writer: مقدمه را با یک وضعیت مشخص شروع کن، نه با تعریف» دارد.
 */

const ROLE = `You are the post-mortem reviewer of a content pipeline.

You are not reviewing the article. You are reviewing how the pipeline produced it,
and your only output is durable instructions that will be added to the system
prompt of a specific agent for every future run.

The agents you can address: ${AGENT_NAMES.join(", ")}.

A good lesson:
- names a repeatable behaviour, not a one-off fact about this article
- is an instruction the agent can follow next time, phrased as a directive
- is specific enough to change the output ("open with the reader's situation in
  the first two sentences, never with a definition"), not a platitude ("write
  better introductions")
- fits in 300 characters — about two sentences. A lesson that needs more room
  than that is a note about this one article, not a durable instruction

Hard limits, enforced on your answer: at most 3 lessons, and each lesson
string between 20 and 300 characters. A longer lesson is rejected outright, and
the run loses every lesson you wrote — so cut it down before you send it.

Return at most 3 lessons — fewer is better. If this run went well and you have
nothing durable to say, return an empty array. Padding the list pollutes the
agents' memory for every future run.

Return JSON only:
{ "lessons": [{ "agent": "writer", "lesson": "..." }] }`;

export async function runCritic(input: {
  briefTitle: string;
  editorReports: EditorReport[];
  revisionRounds: number;
  seoFailures: SeoCheck[];
  finalArticle: string;
  published: boolean;
  humanFeedback?: { rating: "up" | "down"; comment?: string | null } | null;
  onTrace?: (trace: AgentTrace) => void;
}): Promise<CriticResult> {
  const reviews = input.editorReports
    .map(
      (report, index) =>
        `Round ${index + 1}: ${report.score}/100 — ${report.verdict}\n${report.summary}\n${report.issues
          .map((issue) => `  - [${issue.severity}/${issue.area}] ${issue.problem}`)
          .join("\n")}`,
    )
    .join("\n\n");

  const seo =
    input.seoFailures.length > 0
      ? input.seoFailures.map((check) => `- ${check.label}: ${check.detail}`).join("\n")
      : "- all deterministic SEO checks passed";

  const human = input.humanFeedback
    ? `\n\nHuman feedback: ${input.humanFeedback.rating === "up" ? "positive" : "negative"}${
        input.humanFeedback.comment ? ` — "${input.humanFeedback.comment}"` : ""
      }\nHuman feedback outweighs everything else in this report.`
    : "";

  return runAgentJSON({
    agent: "critic",
    system: await systemPromptFor("critic", ROLE),
    prompt: `# Run report

Article: ${input.briefTitle}
Revision rounds used: ${input.revisionRounds}
Outcome: ${input.published ? "published automatically" : "held as a draft for human approval"}

## Editor reviews
${reviews || "(none)"}

## Deterministic SEO checks that failed
${seo}${human}

## Final article

${input.finalArticle.slice(0, 6000)}

Extract the lessons.`,
    temperature: 0.4,
    maxOutputTokens: 1200,
    schema: CriticResultSchema,
    onTrace: input.onTrace,
  });
}
