"use client";

import { useActionState } from "react";
import { unlockStudio } from "@/app/(admin)/studio/actions";
import { Button } from "@/components/ui/Button";
import { studio } from "@/lib/content";

/**
 * فرم رمز استودیو.
 *
 * همان الگوی فرم مشاوره‌ی سایت: useActionState روی یک Server Action، تا بدون
 * جاوااسکریپت هم ارسال شود. تنها تفاوت این است که خطا هیچ جزئیاتی نمی‌دهد —
 * «رمز درست نیست» و نه «کاربر پیدا نشد» یا «رمز کوتاه است».
 */
export function StudioLogin() {
  const [state, action, pending] = useActionState(unlockStudio, { error: false });

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-16">
      <h1 className="text-h2 text-ink">{studio.lockedTitle}</h1>
      <p className="mt-3 text-slate">{studio.lockedBody}</p>

      <form action={action} className="mt-8 grid gap-4">
        <label htmlFor="studio-password" className="text-caption font-semibold text-ink">
          Password
        </label>
        <input
          id="studio-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-describedby={state.error ? "studio-password-error" : undefined}
          className="min-h-12 rounded-btn border border-slate/40 bg-white px-4 text-ink focus:border-brass focus:outline-none focus-visible:ring-2 focus-visible:ring-pine"
        />
        {state.error && (
          <p id="studio-password-error" role="alert" className="text-caption text-clay">
            {studio.lockedError}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {studio.lockedButton}
        </Button>
      </form>
    </main>
  );
}
