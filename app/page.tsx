import { ConsultationForm } from "@/components/sections/ConsultationForm";
import { Credibility } from "@/components/sections/Credibility";
import { Hero } from "@/components/sections/Hero";
import { Pillars } from "@/components/sections/Pillars";
import { Process } from "@/components/sections/Process";
import { Services } from "@/components/sections/Services";

/**
 * A single page, in the order the visitor needs it: what the problem is, what
 * we do about it, how we do it, what happens next, why we can be believed, and
 * then the one thing the site is asking for.
 *
 * Only the header and the form ship JavaScript; everything here is a Server
 * Component.
 */
export default function Page() {
  return (
    <>
      <Hero />
      <Services />
      <Pillars />
      <Process />
      <Credibility />
      <ConsultationForm />
    </>
  );
}
