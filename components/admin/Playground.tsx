"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  Card,
  Empty,
  Field,
  FormStatus,
  buttonClass,
  inputClass,
  textareaClass,
} from "@/components/admin/ui";
import type { ModelOption } from "@/components/admin/ModelForm";
import {
  runPlayground,
  type PlaygroundState,
} from "@/lib/admin/actions/playground";

/**
 * Trying a question, and comparing two models on it.
 *
 * Both answers are produced from the same retrieved passages, shown below them.
 * That is what makes the comparison mean anything: two models given two
 * different contexts tell you nothing about the models.
 */
export function Playground({
  options,
}: {
  options: { provider: string; models: ModelOption[] }[];
}) {
  const [state, action] = useActionState<PlaygroundState, FormData>(runPlayground, {});

  return (
    <>
      <Card
        title="Ask"
        description="Runs against the live persona, the live knowledge base and the live retrieval settings. Nothing is saved: this will not appear in the inbox or on the dashboard."
      >
        <form action={action} className="flex flex-col gap-4">
          <Field label="Question" htmlFor="pg-question">
            <textarea
              id="pg-question"
              name="question"
              required
              placeholder="What happens on the first call?"
              className={`${textareaClass} min-h-[5rem]`}
            />
          </Field>

          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Model" htmlFor="pg-model-a">
              <ModelSelect id="pg-model-a" name="modelA" options={options} first="Whatever is live now" />
            </Field>

            <Field
              label="Compare with (optional)"
              hint="Both answers use the same passages, so the difference is the model."
              htmlFor="pg-model-b"
            >
              <ModelSelect id="pg-model-b" name="modelB" options={options} first="Do not compare" />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Temperature" htmlFor="pg-temp">
              <input
                id="pg-temp"
                name="temperature"
                type="number"
                step="0.05"
                min="0"
                max="2"
                defaultValue={0.3}
                className={inputClass}
              />
            </Field>

            <Field label="Max tokens" htmlFor="pg-max">
              <input
                id="pg-max"
                name="maxTokens"
                type="number"
                min="64"
                max="8000"
                step="64"
                defaultValue={1024}
                className={inputClass}
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Submit />
            <FormStatus status={state.message ? { ok: false, message: state.message } : null} />
          </div>
        </form>
      </Card>

      {state.result && (
        <>
          <div
            className={
              state.result.answers.length > 1
                ? "grid gap-6 lg:grid-cols-2"
                : "flex flex-col gap-6"
            }
          >
            {state.result.answers.map((answer) => (
              <Card key={answer.model} title={answer.model}>
                {answer.error ? (
                  <p className="text-caption text-clay">{answer.error}</p>
                ) : (
                  <p className="whitespace-pre-wrap text-caption text-ink">{answer.text}</p>
                )}

                <p className="mt-3 border-t border-sand pt-3 text-caption text-slate">
                  {answer.tokensIn} in / {answer.tokensOut} out ·{" "}
                  {answer.costUsd === null
                    ? "cost unknown"
                    : `$${answer.costUsd.toFixed(5)}`}{" "}
                  · {(answer.ms / 1000).toFixed(1)}s
                </p>
              </Card>
            ))}
          </div>

          <Card
            title={`Passages retrieved (${state.result.chunks.length})`}
            description="What both answers were built from."
          >
            {state.result.noContext ? (
              <Empty>
                Nothing cleared the similarity threshold, so the assistant was told to
                say it does not have that detail. That is a knowledge base gap, not a
                model problem.
              </Empty>
            ) : (
              <ol className="flex flex-col gap-3">
                {state.result.chunks.map((chunk) => (
                  <li key={chunk.id} className="rounded-card border border-sand bg-bone/60 p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-caption font-semibold text-ink">
                        {chunk.title}
                      </span>
                      <span className="tabular text-caption text-slate">
                        similarity {chunk.similarity.toFixed(3)}
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-caption text-slate">
                      {chunk.content.slice(0, 700)}
                      {chunk.content.length > 700 && "…"}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </>
      )}
    </>
  );
}

function ModelSelect({
  id,
  name,
  options,
  first,
}: {
  id: string;
  name: string;
  options: { provider: string; models: ModelOption[] }[];
  first: string;
}) {
  return (
    <select id={id} name={name} defaultValue="" className={inputClass}>
      <option value="">{first}</option>
      {options.map((group) => (
        <optgroup key={group.provider} label={group.provider}>
          {group.models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.id}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function Submit() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={buttonClass}>
      {pending ? "Asking…" : "Ask"}
    </button>
  );
}
