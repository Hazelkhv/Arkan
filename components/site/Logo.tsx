import { PillarMark, PillarTile } from "@/components/ui/PillarMark";
import { company } from "@/lib/content";

/**
 * Logo lockup: the four-pillar mark plus the "Arkan" wordmark.
 *
 * On light surfaces the mark keeps its supplied Pine tile. On Pine surfaces the
 * tile would vanish into the background, so the strokes are shown bare in Bone
 * with the accent stroke in Brass — the brand guide's monochrome-on-dark rule.
 */
export function Logo({
  tone = "on-light",
  className = "",
}: {
  tone?: "on-light" | "on-dark";
  className?: string;
}) {
  const onDark = tone === "on-dark";

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      {onDark ? (
        <PillarMark active={2} tone="on-dark" className="h-5 w-6" />
      ) : (
        <PillarTile className="h-8 w-8" />
      )}
      <span
        className={`text-[1.375rem] font-bold tracking-[-0.02em] ${
          onDark ? "text-bone" : "text-pine"
        }`}
      >
        {company.name}
      </span>
    </span>
  );
}
