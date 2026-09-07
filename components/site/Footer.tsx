import { Logo } from "@/components/site/Logo";
import { company, footer, nav } from "@/lib/content";

/**
 * Footer. Every contact detail comes from the client brief — nothing here is
 * invented. `on-pine` flips the global focus ring to Bone for this dark band.
 */
export function Footer() {
  return (
    <footer className="on-pine bg-pine text-sand">
      <div className="mx-auto max-w-[75rem] px-5 py-16 sm:px-8 sm:py-20">
        <div className="grid gap-12 md:grid-cols-[1.5fr_1fr_1fr] md:gap-8">
          <div>
            <Logo tone="on-dark" />
            <p className="mt-5 max-w-sm text-body text-sand">
              {footer.statement}
            </p>
            <p className="mt-4 text-caption text-bone/60">{company.tagline}</p>
          </div>

          <nav aria-label="Footer">
            <h2 className="text-eyebrow uppercase text-sand">
              {footer.navHeading}
            </h2>
            <ul className="mt-5 flex flex-col gap-3">
              {nav.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="text-body text-sand transition-colors duration-200 hover:text-bone"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h2 className="text-eyebrow uppercase text-sand">
              {footer.contactHeading}
            </h2>
            <ul className="mt-5 flex flex-col gap-3 text-body">
              <li>
                <a
                  href={`mailto:${company.email}`}
                  className="text-sand transition-colors duration-200 hover:text-bone"
                >
                  {company.email}
                </a>
              </li>
              <li>
                <a
                  href={`tel:${company.phoneHref}`}
                  className="tabular text-sand transition-colors duration-200 hover:text-bone"
                  dir="ltr"
                >
                  {company.phone}
                </a>
              </li>
              <li className="text-sand">
                {company.city}, {company.country}
              </li>
            </ul>
          </div>
        </div>

        <p className="mt-14 border-t border-bone/15 pt-8 text-caption text-bone/60">
          {footer.copyright}
        </p>
      </div>
    </footer>
  );
}
