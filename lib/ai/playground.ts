import { costOf, findModel, getCatalog, resolveDefaultModel } from "@/lib/ai/catalog";
import { getActivePrompt, getEmbeddingSettings } from "@/lib/ai/config";
import { completeChat } from "@/lib/ai/generate";
import { formatContext, retrieve } from "@/lib/ai/retrieve";
import type { RetrievedChunk } from "@/lib/ai/types";

/**
 * A question run against the live configuration, without leaving a trace.
 *
 * Nothing here is written to `conversations` or `messages`. That is the point:
 * an operator testing a prompt change twenty times would otherwise appear on
 * the dashboard as twenty conversations with a hundred per cent bounce rate,
 * and the numbers the firm actually reads would be the firm's own testing.
 *
 * The cost of that is a run that is invisible in the cost reporting too, which
 * is why the price of each answer is returned and shown on the screen instead.
 *
 * It is deliberately the same retrieval and the same system prompt the engine
 * uses. A playground that assembled its own context would be a test of the
 * playground.
 */

export type PlaygroundAnswer = {
  model: string;
  text: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  ms: number;
  error?: string;
};

export type PlaygroundResult = {
  chunks: RetrievedChunk[];
  answers: PlaygroundAnswer[];
  /** True when nothing cleared the threshold, which changes what is asked. */
  noContext: boolean;
};

export async function tryTurn(input: {
  question: string;
  models: (string | null)[];
  temperature?: number;
  maxTokens?: number;
}): Promise<PlaygroundResult> {
  const [prompt, embedding, catalog] = await Promise.all([
    getActivePrompt(),
    getEmbeddingSettings(),
    getCatalog(),
  ]);

  const retrieval = await retrieve(input.question, embedding);
  const context = formatContext(retrieval.chunks);
  const noContext = retrieval.chunks.length === 0;

  const messages = [
    { role: "system" as const, content: prompt.content },
    {
      role: "system" as const,
      content: noContext
        ? "# Retrieved context\n\nNothing in the knowledge base matched this question. Say plainly that you do not have that detail, and offer the initial conversation with the team."
        : `# Retrieved context\n\nAnswer from these passages. Where a passage does not cover something, say so rather than filling the gap.\n\n${context}`,
    },
    { role: "user" as const, content: input.question },
  ];

  const slugs = input.models
    .map((model) => model || resolveDefaultModel(catalog)?.id || null)
    .filter((slug): slug is string => Boolean(slug));

  // In parallel: the whole purpose of a comparison is that the two answers are
  // to the same question with the same context, and waiting twice for that is
  // waiting for nothing.
  const answers = await Promise.all(
    slugs.map(async (slug): Promise<PlaygroundAnswer> => {
      const startedAt = Date.now();

      try {
        const { text, usage } = await completeChat({
          model: slug,
          messages,
          temperature: input.temperature ?? 0.3,
          maxTokens: input.maxTokens ?? 1024,
        });

        return {
          model: slug,
          text,
          tokensIn: usage?.tokensIn ?? 0,
          tokensOut: usage?.tokensOut ?? 0,
          costUsd: costOf(findModel(catalog, slug), usage?.tokensIn ?? 0, usage?.tokensOut ?? 0),
          ms: Date.now() - startedAt,
        };
      } catch (error) {
        return {
          model: slug,
          text: "",
          tokensIn: 0,
          tokensOut: 0,
          costUsd: null,
          ms: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );

  return { chunks: retrieval.chunks, answers, noContext };
}
