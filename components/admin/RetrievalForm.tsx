"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  Card,
  Field,
  FormStatus,
  buttonClass,
  inputClass,
} from "@/components/admin/ui";
import {
  saveEmbeddingConfig,
  type ActionState,
} from "@/lib/admin/actions/config";

/**
 * Embedding and retrieval settings.
 *
 * The one thing this screen has to get right is the warning. Changing the
 * embedding model does not break anything visibly: the index still has vectors
 * in it, searches still run, and every answer quietly gets worse because
 * vectors from two models are not comparable. So the change is gated behind an
 * acknowledgement, and the box resets every time the model field changes.
 *
 * Model ids are typed rather than picked from a list. Each provider names and
 * retires its own, and a dropdown written today would be a list of models that
 * no longer exist by the time somebody opens this page — the provider's own
 * documentation is the only current source.
 */

export type EmbeddingValues = {
  provider: string;
  model: string;
  dimensions: number;
  chunkSize: number;
  chunkOverlap: number;
  chunkingStrategy: string;
  topK: number;
  similarityThreshold: number;
  rerankerEnabled: boolean;
  rerankerProvider: string | null;
  rerankerModel: string | null;
  rerankCandidates: number;
};

const PROVIDERS = [
  {
    value: "openai",
    label: "OpenAI",
    hint: "text-embedding-3-large accepts a dimensions parameter, so 1536 is a supported truncation rather than a lossy one. text-embedding-3-small is cheaper and shorter.",
    env: "OPENAI_API_KEY",
  },
  {
    value: "cohere",
    label: "Cohere",
    hint: "The embed v3/v4 line, with an output_dimension of 1536. Cohere also provides the rerank endpoint below, so one key covers both.",
    env: "COHERE_API_KEY",
  },
  {
    value: "google",
    label: "Google",
    hint: "The gemini-embedding line. The newer models have no task_type parameter — retrieval direction is expressed in the text, which lib/ai/embeddings.ts handles.",
    env: "GOOGLE_API_KEY",
  },
  {
    value: "voyage",
    label: "Voyage AI",
    hint: "An embedding specialist. Its models default to 1024 dimensions and offer 2048, 512 and 256 — none of which is 1536, so switching needs the column migration.",
    env: "VOYAGE_API_KEY",
  },
] as const;

export function RetrievalForm({
  values,
  keysPresent,
}: {
  values: EmbeddingValues;
  keysPresent: Record<string, boolean>;
}) {
  const [state, action] = useActionState<ActionState, FormData>(saveEmbeddingConfig, {});

  const [provider, setProvider] = useState(values.provider);
  const [model, setModel] = useState(values.model);
  const [reranker, setReranker] = useState(values.rerankerEnabled);

  const changingIndex = provider !== values.provider || model !== values.model;
  const selected = PROVIDERS.find((entry) => entry.value === provider);

  return (
    <form action={action} className="flex flex-col gap-6">
      <Card
        title="Embedding"
        description="How text becomes a vector. Every passage in the knowledge base was embedded by whichever model was active when it was indexed."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="Provider" hint={selected?.hint} htmlFor="embed-provider">
            <select
              id="embed-provider"
              name="provider"
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
              className={inputClass}
            >
              {PROVIDERS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                  {keysPresent[entry.value] ? "" : " — no API key set"}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Model"
            hint="Check the exact id against the provider's own documentation; they change."
            htmlFor="embed-model"
          >
            <input
              id="embed-model"
              name="model"
              type="text"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Field
            label="Dimensions"
            hint="Fixed. The chunks.embedding column is vector(1536), and pgvector cannot index beyond 2000. Changing this needs the add / backfill / cut-over migration documented in supabase/assistant.sql."
            htmlFor="embed-dimensions"
          >
            <input
              id="embed-dimensions"
              name="dimensions"
              type="number"
              defaultValue={values.dimensions}
              readOnly
              className={inputClass}
            />
          </Field>

          <div className="flex items-end">
            <p className="text-caption text-slate">
              {selected && !keysPresent[selected.value] && (
                <span className="text-clay">
                  {selected.env} is not set, so indexing and searching will both fail
                  until it is.
                </span>
              )}
            </p>
          </div>
        </div>

        {changingIndex && (
          <div className="mt-4 rounded-card border border-clay/30 bg-clay/[0.06] p-4">
            <p className="text-caption font-semibold text-clay">
              This makes the whole knowledge base unmatchable.
            </p>
            <p className="mt-2 text-caption text-ink">
              Vectors produced by two different models cannot be compared, even at the
              same width. Nothing will error: searches will run and return worse and
              worse results. Every source has to be re-indexed from the knowledge base
              page before an answer can be trusted again.
            </p>
            <label className="mt-3 flex items-start gap-2 text-caption text-ink">
              <input
                type="checkbox"
                name="acknowledged"
                value="yes"
                required
                className="mt-1 h-4 w-4 accent-[#143A32]"
              />
              I understand, and I will re-index every source.
            </label>
          </div>
        )}
      </Card>

      <Card
        title="Chunking"
        description="How a document is cut up before it is embedded. Changing this only affects sources indexed afterwards — re-index the rest."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Chunk size (tokens)" htmlFor="chunk-size">
            <input
              id="chunk-size"
              name="chunkSize"
              type="number"
              min="100"
              max="4000"
              step="50"
              defaultValue={values.chunkSize}
              className={inputClass}
            />
          </Field>

          <Field
            label="Overlap (tokens)"
            hint="Stops a fact that straddles a boundary from being findable from neither side."
            htmlFor="chunk-overlap"
          >
            <input
              id="chunk-overlap"
              name="chunkOverlap"
              type="number"
              min="0"
              max="1000"
              step="10"
              defaultValue={values.chunkOverlap}
              className={inputClass}
            />
          </Field>

          <Field label="Strategy" htmlFor="chunk-strategy">
            <select
              id="chunk-strategy"
              name="chunkingStrategy"
              defaultValue={values.chunkingStrategy}
              className={inputClass}
            >
              <option value="recursive">Recursive — paragraphs, then sentences</option>
              <option value="paragraph">Paragraph — split on blank lines only</option>
              <option value="fixed">Fixed — split on words at the size limit</option>
            </select>
          </Field>
        </div>
      </Card>

      <Card
        title="Retrieval"
        description="How many passages an answer is built from, and how close they have to be."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Passages per answer (top k)"
            hint="More context costs tokens and dilutes the good matches."
            htmlFor="top-k"
          >
            <input
              id="top-k"
              name="topK"
              type="number"
              min="1"
              max="50"
              defaultValue={values.topK}
              className={inputClass}
            />
          </Field>

          <Field
            label="Similarity threshold"
            hint="Higher is stricter. Below this, the assistant says it does not know rather than answering from a weak match."
            htmlFor="threshold"
          >
            <input
              id="threshold"
              name="similarityThreshold"
              type="number"
              min="0"
              max="1"
              step="0.01"
              defaultValue={values.similarityThreshold}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="mt-4 border-t border-sand pt-4">
          <label className="flex items-start gap-2 text-caption font-semibold text-ink">
            <input
              type="checkbox"
              name="rerankerEnabled"
              checked={reranker}
              onChange={(event) => setReranker(event.target.checked)}
              className="mt-1 h-4 w-4 accent-[#143A32]"
            />
            Rerank the results
          </label>
          <p className="mt-1 text-caption text-slate">
            Fetches a wider set and reorders it with a dedicated model. Slower and one
            more API call per question; better ordering when the knowledge base is
            large. If reranking fails the answer still goes out in similarity order.
          </p>

          {reranker && (
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field label="Reranker provider" htmlFor="rerank-provider">
                <select
                  id="rerank-provider"
                  name="rerankerProvider"
                  defaultValue={values.rerankerProvider ?? "cohere"}
                  className={inputClass}
                >
                  <option value="cohere">Cohere</option>
                </select>
              </Field>

              <Field label="Reranker model" htmlFor="rerank-model">
                <input
                  id="rerank-model"
                  name="rerankerModel"
                  type="text"
                  defaultValue={values.rerankerModel ?? ""}
                  placeholder="rerank-v3.5"
                  className={inputClass}
                />
              </Field>

              <Field
                label="Candidates"
                hint="How many passages the reranker gets to choose from."
                htmlFor="rerank-candidates"
              >
                <input
                  id="rerank-candidates"
                  name="rerankCandidates"
                  type="number"
                  min="1"
                  max="200"
                  defaultValue={values.rerankCandidates}
                  className={inputClass}
                />
              </Field>
            </div>
          )}
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Submit />
        <FormStatus status={state} />
      </div>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={buttonClass}>
      {pending ? "Saving…" : "Save settings"}
    </button>
  );
}
