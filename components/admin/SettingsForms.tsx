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
} from "@/components/admin/ui";
import {
  purgeNow,
  saveRateLimit,
  saveRetention,
  type ActionState,
} from "@/lib/admin/actions/settings";

export function RateLimitForm({
  windowSeconds,
  max,
}: {
  windowSeconds: number;
  max: number;
}) {
  const [state, action] = useActionState<ActionState, FormData>(saveRateLimit, {});

  return (
    <Card
      title="Rate limiting"
      description="Per visitor, per channel, counted in the database — an in-memory counter would reset on every cold start and be bypassed by two requests landing on two instances."
    >
      <form action={action} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="Messages allowed" htmlFor="limit-max">
          <input
            id="limit-max"
            name="max"
            type="number"
            min="1"
            max="500"
            defaultValue={max}
            className={inputClass}
          />
        </Field>

        <Field label="Per this many seconds" htmlFor="limit-window">
          <input
            id="limit-window"
            name="windowSeconds"
            type="number"
            min="10"
            max="3600"
            defaultValue={windowSeconds}
            className={inputClass}
          />
        </Field>

        <Submit label="Save" pending="Saving…" className={buttonClass} />
      </form>

      <div className="mt-3">
        <FormStatus status={state} />
      </div>
    </Card>
  );
}

export function RetentionForm({ days }: { days: number }) {
  const [saveState, saveAction] = useActionState<ActionState, FormData>(saveRetention, {});
  const [purgeState, purgeAction] = useActionState<ActionState, FormData>(purgeNow, {});

  return (
    <Card
      title="Data retention"
      description="How long closed conversations are kept. Leads are never deleted by this — a lead is a business record, not a transcript."
    >
      <form action={saveAction} className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field
          label="Delete closed conversations after"
          hint="In days. Zero means keep everything, and that is the shipped default."
          htmlFor="retention-days"
        >
          <input
            id="retention-days"
            name="conversationDays"
            type="number"
            min="0"
            max="3650"
            defaultValue={days}
            className={inputClass}
          />
        </Field>

        <Submit label="Save" pending="Saving…" className={buttonClass} />
      </form>

      <div className="mt-3">
        <FormStatus status={saveState} />
      </div>

      <form action={purgeAction} className="mt-5 border-t border-sand pt-5">
        <p className="text-caption text-slate">
          Nothing is deleted on a schedule. Running the purge applies the period above,
          once, now — and it cannot be undone.
        </p>

        <label className="mt-3 flex items-start gap-2 text-caption text-ink">
          <input
            type="checkbox"
            name="confirm"
            value="yes"
            required
            className="mt-1 h-4 w-4 accent-[#143A32]"
          />
          I understand these transcripts cannot be recovered.
        </label>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Submit
            label="Purge now"
            pending="Deleting…"
            className={dangerButtonClass}
          />
          <FormStatus status={purgeState} />
        </div>
      </form>
    </Card>
  );
}

function Submit({
  label,
  pending: pendingLabel,
  className,
}: {
  label: string;
  pending: string;
  className: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendingLabel : label}
    </button>
  );
}
