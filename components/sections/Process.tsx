import { SectionHeading } from "@/components/ui/SectionHeading";
import { process } from "@/lib/content";

/**
 * The four-step collaboration process from the client brief.
 *
 * The connector is a single rule that the steps share: a top border on each
 * step joins into one horizontal line on desktop, and a left border joins into
 * one vertical rail on mobile. Because adjacent borders must touch to read as
 * one line, the grid has no gap and the spacing is applied inside each cell.
 *
 * The rule is Sand rather than Brass — Brass on Bone measures 2.98:1 and would
 * read as a smudge. Sequence is carried by the numbers regardless of the line.
 */
export function Process() {
  return (
    <section id="process" className="border-b border-sand">
      <div className="mx-auto max-w-[75rem] px-5 py-20 sm:px-8 sm:py-24">
        <SectionHeading
          eyebrow={process.eyebrow}
          heading={process.heading}
          intro={process.intro}
          data-reveal
        />

        <ol className="mt-16 ml-5 grid md:ml-0 md:grid-cols-4">
          {process.steps.map((step, index) => (
            <li
              key={step.title}
              data-reveal
              className="relative border-l border-sand pb-12 pl-8 last:pb-0 md:border-l-0 md:border-t md:pt-12 md:pr-8 md:pb-0 md:pl-0"
            >
              <span
                aria-hidden="true"
                className="tabular absolute -left-5 top-0 flex h-10 w-10 items-center justify-center rounded-full bg-pine text-[0.9375rem] font-bold text-bone md:-top-5 md:left-0"
              >
                {index + 1}
              </span>

              <h3 className="text-h3 text-pine">
                <span className="sr-only">Step {index + 1}: </span>
                {step.title}
              </h3>
              <p className="mt-3 max-w-xs text-body text-slate">
                {step.description}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
