"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass, inputClass } from "@/components/admin/ui";
import { requestLoginLink, type LoginState } from "@/lib/admin/actions/auth";

/**
 * The sign-in form.
 *
 * The same answer is shown whether the address has an account or not, which is
 * why the success state does not say "check your inbox, we sent it" — it says
 * "if that address has access". A form that confirms which addresses exist is a
 * list of the firm's staff for anybody who wants one.
 */
export function LoginForm() {
  const [state, action] = useActionState<LoginState, FormData>(requestLoginLink, {});

  if (state.sent) {
    return (
      <div
        role="status"
        className="rounded-card border border-sand bg-white px-5 py-4 shadow-card"
      >
        <p className="text-body text-ink">{state.message}</p>
        <p className="mt-2 text-caption text-slate">
          The link works once and expires shortly. You can close this tab.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <label htmlFor="admin-email" className="text-caption font-semibold text-ink">
        Email address
      </label>
      <input
        id="admin-email"
        name="email"
        type="email"
        autoComplete="email"
        required
        autoFocus
        placeholder="you@arkan.co"
        className={inputClass}
      />

      {state.message && (
        <p role="alert" className="text-caption text-clay">
          {state.message}
        </p>
      )}

      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={buttonClass}>
      {pending ? "Sending…" : "Email me a link"}
    </button>
  );
}
