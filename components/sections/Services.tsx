import { serviceIcons } from "@/components/icons";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { services } from "@/lib/content";

/**
 * The five services, taken verbatim from the client brief.
 *
 * Cards are not links — there are no service detail pages, and the page has a
 * single conversion goal — so they carry no hover state that would imply one.
 *
 * Icons are Brass on White: 3.29:1, which clears the 3:1 floor for non-text
 * contrast. They would not clear it on the Bone page background, which is why
 * the cards are White rather than transparent.
 */
export function Services() {
  return (
    <section id="services" className="border-b border-sand">
      <div className="mx-auto max-w-[75rem] px-5 py-20 sm:px-8 sm:py-24">
        <SectionHeading
          eyebrow={services.eyebrow}
          heading={services.heading}
          intro={services.intro}
          data-reveal
        />

        <ul className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {services.items.map((service) => {
            const Icon = serviceIcons[service.icon];

            return (
              <li
                key={service.title}
                data-reveal
                className="rounded-card border border-sand bg-white p-7 shadow-card"
              >
                <Icon className="h-7 w-7 text-brass" />
                <h3 className="mt-5 text-h3 text-pine">{service.title}</h3>
                <p className="mt-3 text-body text-slate">
                  {service.description}
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
