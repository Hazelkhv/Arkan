"use server";

import { tryTurn, type PlaygroundResult } from "@/lib/ai/playground";
import { requireAdmin } from "@/lib/admin/auth";

/**
 * The playground's one action.
 *
 * `content` rather than `configure`: trying a question is how an editor checks
 * whether the source they just uploaded actually answers it, and making that
 * an administrator-only screen would put the person who writes the knowledge
 * base at arm's length from the only way to test it.
 */

export type PlaygroundState = {
  message?: string;
  question?: string;
  result?: PlaygroundResult;
};

export async function runPlayground(
  _previous: PlaygroundState,
  formData: FormData,
): Promise<PlaygroundState> {
  await requireAdmin("content");

  const question = String(formData.get("question") ?? "").trim();
  if (!question) return { message: "Type a question first." };

  const modelA = String(formData.get("modelA") ?? "").trim() || null;
  const modelB = String(formData.get("modelB") ?? "").trim() || null;

  const models = modelB && modelB !== modelA ? [modelA, modelB] : [modelA];

  try {
    const result = await tryTurn({
      question,
      models,
      temperature: Number(formData.get("temperature") ?? 0.3),
      maxTokens: Number(formData.get("maxTokens") ?? 1024),
    });

    return { question, result };
  } catch (error) {
    return {
      question,
      message: error instanceof Error ? error.message : "That did not run.",
    };
  }
}
