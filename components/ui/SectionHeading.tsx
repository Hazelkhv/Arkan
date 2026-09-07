import type { HTMLAttributes } from "react";
import { PillarMark } from "@/components/ui/PillarMark";

/**
 * Section header: the four-pillar mark as an eyebrow rule, a label, the H2,
 * and an optional single-line intro. Used by every section so vertical rhythm
 * and heading hierarchy stay identical across the page.
 *
 * Extra attributes are forwarded to the root element so callers can attach
 * `data-reveal` without this needing to know anything about the animation.
 */
export function SectionHeading({
  eyebrow,
  heading,
  intro,
  tone = "on-light",
  className = "",
  ...rest
}: {
  eyebrow: string;
  heading: string;
  intro?: string;
  tone?: "on-light" | "on-dark";
} & HTMLAttributes<HTMLDivElement>) {
  const onDark = tone === "on-dark";

  return (
    <div className={className} {...rest}>
      <div className="flex items-center gap-3">
        <PillarMark tone={tone} className="h-4 w-[1.1667rem] shrink-0" />
        <span
          className={`text-eyebrow uppercase ${onDark ? "text-sand" : "text-slate"}`}
        >
          {eyebrow}
        </span>
      </div>

      <h2
        className={`mt-4 max-w-2xl text-balance text-h2 ${onDark ? "text-bone" : "text-pine"}`}
      >
        {heading}
      </h2>

      {intro ? (
        <p
          className={`mt-4 max-w-xl text-body ${onDark ? "text-sand" : "text-slate"}`}
        >
          {intro}
        </p>
      ) : null}
    </div>
  );
}
