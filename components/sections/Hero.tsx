import Image from "next/image";
import { ButtonLink } from "@/components/ui/Button";
import { PillarMark } from "@/components/ui/PillarMark";
import { company, hero } from "@/lib/content";

/**
 * Hero.
 *
 * Asymmetric split — copy left, photograph right. The supplied image places its
 * subject right of centre, so a centred cover crop keeps the figure in frame at
 * every breakpoint while trimming the empty wall on the left.
 *
 * The line under the CTAs is deliberate: the Trust & Authority landing pattern
 * (ui-ux-pro-max landing.csv #33) asks the hero to carry mission *and*
 * credibility. It stays deliberately short of the three headline statistics,
 * which belong to the Credibility section rather than being repeated here.
 *
 * Nothing here is marked `data-reveal` — this is the LCP region and it should
 * paint immediately.
 */
export function Hero() {
  return (
    <section id="top" className="border-b border-sand">
      <div className="mx-auto grid max-w-[75rem] items-center gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:py-28">
        <div>
          <div className="flex items-center gap-3">
            <PillarMark className="h-4 w-[1.1667rem] shrink-0" />
            <span className="text-eyebrow uppercase text-slate">
              {company.tagline}
            </span>
          </div>

          <h1 className="mt-6 max-w-[15ch] text-balance text-h1 text-pine">
            {hero.headline}
          </h1>

          <p className="mt-6 max-w-xl text-body text-slate">
            {hero.supporting}
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <ButtonLink href="#contact">{hero.primaryCta}</ButtonLink>
            <ButtonLink href="#process" variant="secondary">
              {hero.secondaryCta}
            </ButtonLink>
          </div>

          <p className="mt-12 border-t border-sand pt-8 text-caption text-slate">
            {hero.trustLine}
          </p>        </div>

        <div className="relative aspect-[16/11] overflow-hidden rounded-card bg-sand lg:aspect-[4/3]">
          <Image
            src="/hero.jpg"
            alt={hero.imageAlt}
            fill
            priority
            sizes="(min-width: 1024px) 46vw, 100vw"
            className="object-cover object-center"
          />
        </div>
      </div>
    </section>
  );
}
