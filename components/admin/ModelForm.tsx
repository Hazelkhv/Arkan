"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  Card,
  Field,
  FormStatus,
  buttonClass,
  dangerButtonClass,
  inputClass,
  textareaClass,
} from "@/components/admin/ui";
import {
  clearChannelModel,
  saveModelConfig,
  type ActionState,
} from "@/lib/admin/actions/config";
import { channelLabel } from "@/lib/admin/labels";

/**
 * Choosing and tuning the model a channel answers on.
 *
 * The list of models is passed in, not fetched here, and it comes from
 * OpenRouter's live catalog: a hardcoded list would name models that have been
 * retired, and the symptom is a 404 on a visitor's question rather than an
 * error anyone sees.
 *
 * "Automatic" is the shipped default and stays first in the list. It resolves
 * to the newest model in the cheap, fast, tool-capable tier every time it is
 * asked, which is the setting that does not rot.
 */

export type ModelOption = {
  id: string;
  name: string;
  provider: string;
  contextLength: number;
  promptPrice: number;
  completionPrice: number;
};

export type ModelFormValues = {
  channel: string | null;
  activeModel: string | null;
  fallbackModel: string | null;
  temperature: number;
  maxTokens: number;
  topP: number;
  schedule: unknown[];
  monthlyBudgetUsd: number | null;
};

export function ModelForm({
  values,
  options,
  resolved,
  inherited,
}: {
  values: ModelFormValues;
  options: { provider: string; models: ModelOption[] }[];
  /** What "Automatic" picks right now, so the choice is never a mystery. */
  resolved: string | null;
  /** True for a channel with no row of its own. */
  inherited?: boolean;
}) {
  const [state, action] = useActionState<ActionState, FormData>(saveModelConfig, {});
  const [clearState, clearAction] = useActionState<ActionState, FormData>(
    clearChannelModel,
    {},
  );

  const title = values.channel ? channelLabel(values.channel) : "Default";

  return (
    <Card
      title={title}
      description={
        values.channel
          ? inherited
            ? "This channel currently follows the default. Saving here gives it settings of its own."
            : "This channel overrides the default completely."
          : "Used by every channel that has no settings of its own."
      }
    >
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="channel" value={values.channel ?? ""} />

        <div className="grid gap-4 lg:grid-cols-2">
          <Field
            label="Model"
            hint={
              resolved
                ? `Automatic currently resolves to ${resolved}.`
                : "Automatic picks from the live OpenRouter catalog."
            }
            htmlFor={`model-${title}`}
          >
            <ModelSelect
              id={`model-${title}`}
              name="activeModel"
              value={values.activeModel}
              options={options}
              autoLabel="Automatic — cheapest current fast model"
            />
          </Field>

          <Field
            label="Fallback model"
            hint="Used only when the first model fails before it has said anything."
            htmlFor={`fallback-${title}`}
          >
            <ModelSelect
              id={`fallback-${title}`}
              name="fallbackModel"
              value={values.fallbackModel}
              options={options}
              autoLabel="None"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Temperature"
            hint="0 is repeatable. 0.3 suits a support assistant."
            htmlFor={`temp-${title}`}
          >
            <input
              id={`temp-${title}`}
              name="temperature"
              type="number"
              step="0.05"
              min="0"
              max="2"
              defaultValue={values.temperature}
              className={inputClass}
            />
          </Field>

          <Field label="Max tokens" hint="The length of one answer." htmlFor={`max-${title}`}>
            <input
              id={`max-${title}`}
              name="maxTokens"
              type="number"
              min="64"
              max="32000"
              step="64"
              defaultValue={values.maxTokens}
              className={inputClass}
            />
          </Field>

          <Field label="Top P" htmlFor={`topp-${title}`}>
            <input
              id={`topp-${title}`}
              name="topP"
              type="number"
              step="0.05"
              min="0"
              max="1"
              defaultValue={values.topP}
              className={inputClass}
            />
          </Field>
        </div>

        <Field
          label="Monthly spend cap (USD)"
          hint="Past the cap the assistant keeps answering on the cheapest capable model rather than going quiet. Leave blank for no cap."
          htmlFor={`budget-${title}`}
        >
          <input
            id={`budget-${title}`}
            name="monthlyBudgetUsd"
            type="number"
            step="1"
            min="0"
            defaultValue={values.monthlyBudgetUsd ?? ""}
            placeholder="No cap"
            className={inputClass}
          />
        </Field>

        <Field
          label="Schedule"
          hint={
            'A JSON list of windows that override the model by day and time, in Tehran unless a "tz" says otherwise. Days are 1 = Monday.'
          }
          htmlFor={`schedule-${title}`}
        >
          <textarea
            id={`schedule-${title}`}
            name="schedule"
            spellCheck={false}
            defaultValue={JSON.stringify(values.schedule ?? [], null, 2)}
            placeholder='[{"days":[1,2,3,4,5],"from":"09:00","to":"17:00","model":"anthropic/claude-haiku-4.5"}]'
            className={`${textareaClass} font-mono text-caption`}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-3">
          <Submit />
          <FormStatus status={state} />
        </div>
      </form>

      {values.channel && !inherited && (
        <form action={clearAction} className="mt-4 border-t border-sand pt-4">
          <input type="hidden" name="channel" value={values.channel} />
          <button type="submit" className={`${dangerButtonClass} px-4 text-caption`}>
            Follow the default instead
          </button>
          <FormStatus status={clearState} />
        </form>
      )}
    </Card>
  );
}

function ModelSelect({
  id,
  name,
  value,
  options,
  autoLabel,
}: {
  id: string;
  name: string;
  value: string | null;
  options: { provider: string; models: ModelOption[] }[];
  autoLabel: string;
}) {
  return (
    <select id={id} name={name} defaultValue={value ?? ""} className={inputClass}>
      <option value="">{autoLabel}</option>
      {options.map((group) => (
        <optgroup key={group.provider} label={group.provider}>
          {group.models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.id} — {formatContext(model.contextLength)} ctx,{" "}
              {formatPrice(model.promptPrice)} in / {formatPrice(model.completionPrice)} out
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function formatContext(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}K`;
  return String(tokens);
}

/** Per million tokens: per-token prices are all leading zeroes. */
function formatPrice(perToken: number): string {
  const perMillion = perToken * 1_000_000;
  if (perMillion === 0) return "free";
  return `$${perMillion < 1 ? perMillion.toFixed(2) : perMillion.toFixed(2)}/M`;
}

function Submit() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={buttonClass}>
      {pending ? "Saving…" : "Save"}
    </button>
  );
}
