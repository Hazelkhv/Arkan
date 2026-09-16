import { z } from "zod";
import { runAgentJSON, type AgentTrace } from "@/lib/blog/ai";
import { systemPromptFor } from "@/lib/blog/agents/lessons";
import { ResearchSchema, type Brief, type Research } from "@/lib/blog/agents/types";
import { isWebSearchEnabled, renderSearchResults, searchWeb } from "@/lib/blog/search";

/**
 * ایجنت ۳ — پژوهشگر.
 *
 * این ایجنت در دو مرحله کار می‌کند و مرحله‌ی وسطش اصلاً LLM نیست:
 *
 *   مرحله‌ی الف (مدل)  : «برای این بریف چه باید جستجو کرد؟» → فهرست کوئری
 *   مرحله‌ی ب  (کد)    : fetch به Tavily
 *   مرحله‌ی ج (مدل)  : «از این نتایج، چه چیزی به‌درد مقاله می‌خورد؟» → پژوهش ساخت‌یافته
 *
 * چرا دو تماس با مدل به‌جای یکی؟ چون در یک تماس، مدل هم باید جستجو را تصور کند و
 * هم نتیجه‌اش را خلاصه کند — و دقیقاً همان‌جاست که «منبع» از خیال ساخته می‌شود.
 * وقتی نتایج واقعی جلویش گذاشته شود، ادعای بی‌منبع قابل تشخیص است.
 *
 * بدون TAVILY_API_KEY هم کار می‌کند: مرحله‌ی ب خالی برمی‌گردد و در پرامپت مرحله‌ی
 * ج صریحاً نوشته می‌شود که منبعی در کار نیست. یک بخشِ خالی که اعلام نشود، مدل را
 * وادار می‌کند از حافظه‌اش پر کند و با همان اطمینان هم بنویسد.
 */

const QuerySchema = z.object({
  queries: z.array(z.string().min(3)).min(2).max(4),
});

const QUERY_ROLE = `You decide what to search for. You do not answer anything yourself.

Given a content brief, produce 2–4 web search queries that would surface material
worth citing: current practice, concrete examples, common failure patterns,
credible figures. Write them the way a researcher types into a search box — short,
specific, no boolean operators, no site: filters.

Return JSON only: { "queries": ["...", "..."] }`;

const RESEARCH_ROLE = `You are the researcher who prepares the material the writer will use.

You produce raw material, not prose. The writer turns it into an article.

Rules that matter more than anything else here:
- A "fact" with no source is a claim, not a fact. Include the source URL when the
  search results support it. If you are working without search results, still list
  what you know — but leave "source" out, and never phrase it as a measured
  statistic, a study, or a percentage.
- NEVER attribute anything to Arkan that is not in the company profile. No client
  names, no project outcomes, no internal figures.
- Examples should be illustrative situations a 5–50 employee business would
  recognise ("a workshop that grew to 30 people with no middle layer"), described
  generically. Do not present them as real Arkan clients.
- Common questions are the ones this reader actually asks out loud. They become
  the article's FAQ.

Return JSON only:
{
  "queries": ["the queries that were run"],
  "facts": [{ "claim": "...", "source": "https://... (omit if none)" }],
  "examples": ["...", "..."],
  "commonQuestions": ["...", "...", "..."],
  "angleNotes": "what the writer should emphasise, and what to avoid"
}`;

function renderBrief(brief: Brief): string {
  return [
    `Title: ${brief.title}`,
    `Audience: ${brief.audience}`,
    `Promise: ${brief.promise}`,
    `Primary keyword: ${brief.primaryKeyword}`,
    `Secondary keywords: ${brief.secondaryKeywords.join(", ")}`,
    "Outline:",
    ...brief.outline.map(
      (section) =>
        `  - ${section.heading}\n${section.points.map((point) => `      · ${point}`).join("\n")}`,
    ),
  ].join("\n");
}

export async function runResearcher(input: {
  brief: Brief;
  onTrace?: (trace: AgentTrace) => void;
}): Promise<Research> {
  const briefText = renderBrief(input.brief);

  // مرحله‌ی الف — مدل تصمیم می‌گیرد چه جستجو شود.
  let queries: string[] = [];
  if (isWebSearchEnabled()) {
    const decided = await runAgentJSON({
      agent: "researcher",
      system: await systemPromptFor("researcher", QUERY_ROLE),
      prompt: `Content brief:\n\n${briefText}\n\nWhat should be searched?`,
      temperature: 0.4,
      maxOutputTokens: 500,
      schema: QuerySchema,
      onTrace: input.onTrace,
    });
    queries = decided.queries;
  }

  // مرحله‌ی ب — کد اجرا می‌کند.
  const results = await searchWeb(queries);

  // مرحله‌ی ج — مدل از مواد خام، پژوهش می‌سازد.
  return runAgentJSON({
    agent: "researcher",
    system: await systemPromptFor("researcher", RESEARCH_ROLE),
    prompt: `Content brief:\n\n${briefText}\n\nSearch results:\n\n${renderSearchResults(
      results,
    )}\n\n${
      results.length === 0
        ? "You have no external sources. Do not invent any. Every entry in `facts` must be framed as professional judgement, and `source` must be omitted."
        : "Use these results. Cite the URL of any result you draw a fact from."
    }\n\nPrepare the research.`,
    temperature: 0.5,
    maxOutputTokens: 2500,
    schema: ResearchSchema,
    onTrace: input.onTrace,
  });
}
