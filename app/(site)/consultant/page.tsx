import type { Metadata } from "next";
import Link from "next/link";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { PillarMark } from "@/components/ui/PillarMark";
import { isAssistantConfigured } from "@/lib/ai/admin-client";
import { getChannelSettings } from "@/lib/ai/config";
import { assistant, seo } from "@/lib/content";

/**
 * The full-page chat.
 *
 * A Server Component that reads the operator's settings and hands them to one
 * Client Component. The greeting and the starter questions come from
 * channel_settings, so they are editable in the admin panel; the fallbacks in
 * lib/content.ts are what a fresh install shows before anybody has set them.
 *
 * The page is a single viewport-height column with its own scroll area, so the
 * composer is part of the layout rather than a fixed bar floating over it —
 * which is what keeps it from covering a focused element (WCAG 2.2 Focus Not
 * Obscured).
 */

/**
 * Never prerendered. The greeting and the starter questions are operator
 * settings, and a page baked at build time would keep showing whatever they
 * were when the deploy ran — including "unavailable", if the keys were added
 * afterwards.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ask Arkan",
  description: assistant.intro,
  alternates: { canonical: "/consultant" },
  openGraph: {
    title: `Ask Arkan | ${seo.title}`,
    description: assistant.intro,
    url: "/consultant",
  },
};

export default async function ConsultantPage() {
  const settings = isAssistantConfigured()
    ? await getChannelSettings("web").catch(() => null)
    : null;

  const available = settings?.enabled ?? false;

  return (
    <div className="flex min-h-[calc(100dvh-var(--header-h))] flex-col px-5 sm:px-8">
      <header className="mx-auto w-full max-w-[46rem] pt-10 pb-6 sm:pt-14">
        <div className="flex items-center gap-3">
          <PillarMark className="h-4 w-[1.1667rem] shrink-0" />
          <span className="text-eyebrow uppercase text-slate">
            {assistant.eyebrow}
          </span>
        </div>

        <h1 className="mt-4 text-balance text-h1 text-pine">{assistant.heading}</h1>
        <p className="mt-4 max-w-xl text-body text-slate">{assistant.intro}</p>
      </header>

      {available ? (
        <ChatPanel
          channel="web"
          welcome={settings?.welcomeMessage ?? null}
          starters={settings?.quickReplies?.length ? [...settings.quickReplies] : undefined}
        />
      ) : (
        <Unavailable />
      )}
    </div>
  );
}

/**
 * What the page shows before the keys are configured, or if an operator has
 * switched the channel off.
 *
 * It still does the site's one job: the consultation form is one click away.
 * An assistant that is not running is not a reason to lose the visitor.
 */
function Unavailable() {
  return (
    <div className="mx-auto w-full max-w-[46rem] pb-16">
      <div className="rounded-card border border-sand bg-white p-6 shadow-card">
        <p className="text-body text-ink">{assistant.offline}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/#contact"
            className="inline-flex min-h-12 items-center rounded-btn bg-pine px-6 font-semibold text-bone transition-colors duration-200 hover:bg-[#0f2c26]"
          >
            {assistant.cta}
          </Link>
          <a
            href="mailto:nazanin.khosravi20.nk@gmail.com"
            className="inline-flex min-h-12 items-center rounded-btn border border-pine px-6 font-semibold text-pine transition-colors duration-200 hover:bg-pine/[0.06]"
          >
            nazanin.khosravi20.nk@gmail.com
          </a>
        </div>
      </div>
    </div>
  );
}
