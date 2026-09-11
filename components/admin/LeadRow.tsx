"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Field, FormStatus, buttonClass, inputClass, textareaClass } from "@/components/admin/ui";
import { updateLead, type ActionState } from "@/lib/admin/actions/leads";
import { LEAD_STATUSES, LEAD_STATUS_LABELS } from "@/lib/admin/lead-status";
import { when } from "@/lib/admin/labels";

/**
 * The follow-up controls on one lead.
 *
 * Status and notes save together in one form, because they change together: an
 * operator marking a lead "contacted" is the same operator writing down what
 * was said, and two separate saves is two chances to lose one of them.
 */
export function LeadRow({
  id,
  status,
  notes,
  createdAt,
}: {
  id: string;
  status: string;
  notes: string | null;
  createdAt: string;
}) {
  const [state, action] = useActionState<ActionState, FormData>(updateLead, {});

  return (
    <form action={action} className="mt-4 border-t border-sand pt-4">
      <input type="hidden" name="leadId" value={id} />

      <div className="grid gap-4 sm:grid-cols-[14rem_1fr]">
        <Field label="Follow-up status" htmlFor={`status-${id}`}>
          <select
            id={`status-${id}`}
            name="status"
            defaultValue={LEAD_STATUSES.includes(status as never) ? status : "new"}
            className={inputClass}
          >
            {LEAD_STATUSES.map((value) => (
              <option key={value} value={value}>
                {LEAD_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Notes" htmlFor={`notes-${id}`}>
          <textarea
            id={`notes-${id}`}
            name="notes"
            defaultValue={notes ?? ""}
            placeholder="What was agreed, when to call back…"
            className={`${textareaClass} min-h-[5rem]`}
          />
        </Field>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-caption text-slate">Received {when(createdAt)}</p>
        <div className="flex items-center gap-3">
          <FormStatus status={state} />
          <Submit />
        </div>
      </div>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={`${buttonClass} text-caption`}>
      {pending ? "Saving…" : "Save"}
    </button>
  );
}
