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
  secondaryButtonClass,
} from "@/components/admin/ui";
import {
  changeRole,
  inviteUser,
  revokeUser,
  type ActionState,
} from "@/lib/admin/actions/users";
import { ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, type Role } from "@/lib/admin/roles";

/**
 * Adding and removing panel access.
 *
 * There is no invitation email. Adding a row here is what allows an address to
 * request a sign-in link at all, and the person then goes to the login page
 * themselves — which means there is no invitation token to leak, expire or be
 * forwarded to somebody else.
 */

export function InviteForm() {
  const [state, action] = useActionState<ActionState, FormData>(inviteUser, {});

  return (
    <Card
      title="Give somebody access"
      description="No email is sent. Once their address is here, they can request a sign-in link from the login page."
    >
      <form action={action} className="grid gap-4 sm:grid-cols-[1fr_1fr_14rem_auto] sm:items-end">
        <Field label="Email address" htmlFor="invite-email">
          <input
            id="invite-email"
            name="email"
            type="email"
            required
            className={inputClass}
          />
        </Field>

        <Field label="Name (optional)" htmlFor="invite-name">
          <input id="invite-name" name="name" type="text" className={inputClass} />
        </Field>

        <Field label="Role" htmlFor="invite-role">
          <select id="invite-role" name="role" defaultValue="read_only" className={inputClass}>
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </Field>

        <Submit label="Add" pending="Adding…" className={buttonClass} />
      </form>

      <div className="mt-3">
        <FormStatus status={state} />
      </div>

      <dl className="mt-4 grid gap-2 border-t border-sand pt-4 text-caption sm:grid-cols-2">
        {ROLES.map((role) => (
          <div key={role}>
            <dt className="font-semibold text-ink">{ROLE_LABELS[role]}</dt>
            <dd className="text-slate">{ROLE_DESCRIPTIONS[role]}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export function UserControls({
  email,
  role,
  isSelf,
}: {
  email: string;
  role: Role;
  isSelf: boolean;
}) {
  const [roleState, roleAction] = useActionState<ActionState, FormData>(changeRole, {});
  const [revokeState, revokeAction] = useActionState<ActionState, FormData>(revokeUser, {});

  if (isSelf) {
    return (
      <p className="text-caption text-slate">
        This is you. Another owner can change it.
      </p>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <form action={roleAction} className="flex items-end gap-2">
          <input type="hidden" name="email" value={email} />
          <label htmlFor={`role-${email}`} className="sr-only">
            Role for {email}
          </label>
          <select
            id={`role-${email}`}
            name="role"
            defaultValue={role}
            className={`${inputClass} w-auto`}
          >
            {ROLES.map((value) => (
              <option key={value} value={value}>
                {ROLE_LABELS[value]}
              </option>
            ))}
          </select>
          <Submit
            label="Change"
            pending="Saving…"
            className={`${secondaryButtonClass} px-3 text-caption`}
          />
        </form>

        <form
          action={revokeAction}
          onSubmit={(event) => {
            if (!window.confirm(`Remove ${email}'s access to the admin panel?`)) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="email" value={email} />
          <Submit
            label="Remove"
            pending="Removing…"
            className={`${dangerButtonClass} px-3 text-caption`}
          />
        </form>
      </div>

      <FormStatus status={roleState.message ? roleState : revokeState} />
    </div>
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
