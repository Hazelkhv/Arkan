/**
 * The four-pillar mark.
 *
 * Geometry is lifted directly from the supplied `favicon.svg`: four vertical
 * strokes at coordinated heights (14 / 20 / 18 / 12) sharing one baseline,
 * normalised here to a 28x24 box so the round caps land exactly on the edges.
 *
 * `active` paints one stroke in the accent colour — the logo highlights the
 * third pillar, and each card in the Four Pillars section highlights its own.
 * The highlight is decorative: which pillar a card belongs to is always stated
 * in its number and title as well, never by colour alone.
 */

const STROKES = [
  { x: 2, top: 8 },
  { x: 10, top: 2 },
  { x: 18, top: 4 },
  { x: 26, top: 10 },
] as const;

const BASELINE = 22;

type Tone = "on-light" | "on-dark";

const TONE_CLASSES: Record<Tone, { base: string; active: string }> = {
  // Brass measures 2.98:1 on Bone, below the 3:1 non-text floor, so it is not
  // used on light surfaces. Pine carries the highlight there instead.
  "on-light": { base: "stroke-sand", active: "stroke-pine" },
  // On Pine, Brass measures 3.8:1 and reads cleanly.
  "on-dark": { base: "stroke-bone/40", active: "stroke-brass" },
};

export function PillarMark({
  active = null,
  tone = "on-light",
  className = "",
}: {
  active?: number | null;
  tone?: Tone;
  className?: string;
}) {
  const classes = TONE_CLASSES[tone];

  return (
    <svg
      viewBox="0 0 28 24"
      fill="none"
      strokeWidth={4}
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {STROKES.map((stroke, index) => (
        <line
          key={stroke.x}
          x1={stroke.x}
          y1={BASELINE}
          x2={stroke.x}
          y2={stroke.top}
          className={index === active ? classes.active : classes.base}
        />
      ))}
    </svg>
  );
}

/**
 * The mark as it appears inside the logo: a Pine tile with Bone strokes and the
 * third stroke in Brass, exactly as supplied. Brass on Pine is 3.8:1.
 */
export function PillarTile({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <rect width="64" height="64" rx="14" className="fill-pine" />
      <g fill="none" strokeWidth={4} strokeLinecap="round">
        <line x1="20" y1="42" x2="20" y2="28" className="stroke-bone" />
        <line x1="28" y1="42" x2="28" y2="22" className="stroke-bone" />
        <line x1="36" y1="42" x2="36" y2="24" className="stroke-brass" />
        <line x1="44" y1="42" x2="44" y2="30" className="stroke-bone" />
      </g>
    </svg>
  );
}
