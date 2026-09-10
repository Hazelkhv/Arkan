import type { Metadata } from "next";
import Link from "next/link";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { isAssistantConfigured } from "@/lib/ai/admin-client";
import { assistant, consultation, seo } from "@/lib/content";

/**
 * The full-page chat channel.
 *
 * It sits beside the consultation form rather than replacing it: the form is
 * still the conversion goal, and someone who already knows they want to talk
 * should not have to chat their way there. The CTA at the bottom is always
 * visible for exactly that reason.
 *
 * Not indexed. The answers are generated, so they are not pages we want ranking
 * for Arkan — the single page is what search should find.
 */
export const metadata: Metadata = {
  title: assistant.heading,
  description: assistant.supporting,
  robots: { index: false, follow: true },
  alternates: { canonical: "/consultant" },
  openGraph: {
    title: `${assistant.heading} | ${seo.title}`,
    description: assistant.supporting,
  },
};

export default function ConsultantPage() {
  const configured = isAssistantConfigured();

  return (
    <section className="bg-bone">
      <div className="mx-auto max-w-5xl px-5 py-16 sm:px-8 sm:py-24">
        <p className="text-eyebrow uppercase text-brass">{assistant.eyebrow}</p>

        <h1 className="mt-3 max-w-2xl text-h1 text-ink">{assistant.heading}</h1>

        <p className="mt-4 max-w-2xl text-body text-slate">
          {assistant.supporting}
        </p>

        <div className="mt-10">
          {configured ? (
            <ChatPanel />
          ) : (
            <div className="rounded-card border border-sand bg-white p-8 shadow-card">
              <p className="text-body text-ink">{assistant.unavailable}</p>
            </div>
          )}
        </div>

        <div className="mt-12 rounded-card bg-pine px-6 py-8 sm:px-10 sm:py-10 on-pine">
          <h2 className="text-h3 text-bone">{assistant.ctaHeading}</h2>
          <p className="mt-2 max-w-xl text-body text-sand">{assistant.ctaBody}</p>

          <Link
            href="/#contact"
            className="mt-6 inline-flex min-h-[3rem] items-center rounded-btn bg-bone px-6 py-3 text-body font-semibold text-pine transition-colors duration-200 ease-out-soft hover:bg-sand"
          >
            {consultation.submitLabel}
          </Link>
        </div>
      </div>
    </section>
  );
}
