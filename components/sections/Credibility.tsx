import Image from "next/image";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { credibility } from "@/lib/content";

/**
 * Credibility — the `About` anchor.
 *
 * Every claim on this page lives here, and every one of them comes from the
 * client brief: the three statistics, the founder's background, and two
 * testimonials reproduced word for word. No logos, no case studies, no awards,
 * no invented numbers.
 *
 * Figures use tabular numerals, as the brand guide requires for numeric data.
 */
export function Credibility() {
  return (
    <section id="about" className="border-b border-sand">
      <div className="mx-auto max-w-[75rem] px-5 py-20 sm:px-8 sm:py-24">
        <SectionHeading
          eyebrow={credibility.eyebrow}
          heading={credibility.heading}
          data-reveal
        />

        <dl
          data-reveal
          className="mt-12 grid gap-8 border-y border-sand py-10 sm:grid-cols-3"
        >
          {credibility.stats.map((stat) => (
            <div key={stat.label}>
              <dt className="text-caption text-slate">{stat.label}</dt>
              <dd className="tabular mt-1 text-h1 font-bold leading-none text-pine">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-16 grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div data-reveal className="border-t border-sand pt-8">
            <h3 className="text-h3 text-pine">
              {credibility.founder.name}
            </h3>
            <p className="text-caption text-slate">{credibility.founder.role}</p>
            <p className="mt-5 max-w-md text-body text-ink">
              {credibility.founder.bio}
            </p>
          </div>

          <div
            data-reveal
            className="relative aspect-[4/3] overflow-hidden rounded-card bg-sand"
          >
            <Image
              src="/team.jpg"
              alt={credibility.imageAlt}
              fill
              loading="lazy"
              sizes="(min-width: 1024px) 46vw, 100vw"
              className="object-cover object-center"
            />
          </div>
        </div>

        <h3 className="sr-only">{credibility.testimonialsHeading}</h3>

        <ul className="mt-16 grid gap-5 md:grid-cols-2">
          {credibility.testimonials.map((testimonial) => (
            <li key={testimonial.attribution} data-reveal>
              <figure className="h-full rounded-card border border-sand bg-white p-8 shadow-card">
                {/* Brass on White is 3.29:1 — above the 3:1 non-text floor. */}
                <span
                  aria-hidden="true"
                  className="block h-0.5 w-10 rounded-full bg-brass"
                />
                <blockquote className="mt-6 text-[1.125rem] leading-relaxed text-pine">
                  <p>&ldquo;{testimonial.quote}&rdquo;</p>
                </blockquote>
                <figcaption className="mt-5 text-caption text-slate">
                  {testimonial.attribution}
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
