import { PillarMark } from "@/components/ui/PillarMark";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { pillars } from "@/lib/content";

/**
 * The Four Pillars — the brand's signature section, and the page's single dark
 * band. It carries the 30% Pine in the brand guide's 60/30/10 split and anchors
 * the middle of the page.
 *
 * Each card renders the logo's own mark with *its* stroke picked out in Brass,
 * so the four cards read as one system rather than four generic boxes. Which
 * pillar a card is remains stated by its number and title, never by colour.
 *
 * Brass here is legal: on Pine it measures 3.8:1, which clears 3:1 for the
 * marks and for numerals set at large-text size.
 */
export function Pillars() {
  return (
    <section id="pillars" className="on-pine bg-pine">
      <div className="mx-auto max-w-[75rem] px-5 py-20 sm:px-8 sm:py-24">
        <SectionHeading
          eyebrow={pillars.eyebrow}
          heading={pillars.heading}
          intro={pillars.intro}
          tone="on-dark"
          data-reveal
        />

        <ol className="mt-14 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.items.map((pillar, index) => (
            <li
              key={pillar.title}
              data-reveal
              className="border-t border-bone/20 pt-6"
            >
              <div className="flex items-end justify-between gap-4">
                <span className="tabular text-h2 font-bold text-brass">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <PillarMark
                  active={index}
                  tone="on-dark"
                  className="h-6 w-7 shrink-0"
                />
              </div>

              <h3 className="mt-5 text-h3 text-bone">{pillar.title}</h3>
              <p className="mt-3 text-body text-sand">{pillar.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
