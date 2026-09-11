import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/LoginForm";
import { PillarMark } from "@/components/ui/PillarMark";
import { isAssistantConfigured } from "@/lib/ai/admin-client";
import { currentAdmin } from "@/lib/admin/auth";
import { company } from "@/lib/content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;

  if (!isAssistantConfigured()) return <NotConfigured />;

  // Somebody arriving here with a valid session has no business on a login
  // form; send them where they were going.
  if (await currentAdmin()) redirect("/admin");

  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-16">
      <div className="w-full max-w-[26rem]">
        <div className="flex items-center gap-3">
          <PillarMark className="h-5 w-[1.4583rem] shrink-0" />
          <span className="text-eyebrow uppercase text-slate">
            {company.name} — admin
          </span>
        </div>

        <h1 className="mt-5 text-h2 text-pine">Sign in</h1>
        <p className="mt-2 text-caption text-slate">
          We will email you a link. There is no password to remember or to lose.
        </p>

        {params.error === "link" && (
          <p
            role="alert"
            className="mt-5 rounded-card border border-clay/30 bg-clay/[0.06] px-4 py-3 text-caption text-clay"
          >
            That link has expired or has already been used. Request a new one.
          </p>
        )}

        <div className="mt-6">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}

/**
 * What the panel shows before the service role key is set.
 *
 * Naming the variable is the whole point: every symptom of it being missing —
 * a login form that never signs anybody in, an assistant that answers nothing —
 * points somewhere else entirely.
 */
function NotConfigured() {
  return (
    <main className="mx-auto max-w-[36rem] px-5 py-20">
      <h1 className="text-h2 text-pine">The admin panel is not configured</h1>
      <p className="mt-4 text-body text-slate">
        Set <code className="rounded bg-sand/70 px-1">SUPABASE_SERVICE_ROLE_KEY</code>{" "}
        and{" "}
        <code className="rounded bg-sand/70 px-1">ADMIN_BOOTSTRAP_EMAIL</code>, then
        reload. The assistant&apos;s tables have row level security enabled with no
        policies, so the publishable key cannot read any of them — including the
        one that says who is allowed in here.
      </p>
      <p className="mt-4 text-caption text-slate">See .env.example for the full list.</p>
    </main>
  );
}
