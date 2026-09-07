import type { SVGProps } from "react";

/**
 * Five service icons, drawn by hand rather than pulled from a library.
 *
 * The prompt rules out heavy icon dependencies, and five glyphs do not justify
 * one. They share a single grammar — 24x24 box, 1.5px stroke, round caps and
 * joins, `currentColor` — so colour and size are controlled entirely by the
 * consuming component. All are decorative: every icon sits beside a text title.
 */

const base: SVGProps<SVGSVGElement> = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
};

/** Growth Strategy — a compass: direction, and where to compete. */
function CompassIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.6 8.4 13.4 13.4 8.4 15.6 10.6 10.6Z" />
    </svg>
  );
}

/** Business Model Redesign — a block set with one piece moved out of line. */
function ModelIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <path d="M14.5 17.25h6.5M18 14v6.5" />
    </svg>
  );
}

/** Brand & Marketing — a signal radiating outward: reach and attention. */
function MarketIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="2" />
      <path d="M7.8 16.2a6 6 0 0 1 0-8.4M16.2 7.8a6 6 0 0 1 0 8.4" />
      <path d="M4.9 19.1a10 10 0 0 1 0-14.2M19.1 4.9a10 10 0 0 1 0 14.2" />
    </svg>
  );
}

/** Organisational Structure — an org chart: one lead, three reports. */
function StructureIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="9" y="3" width="6" height="5" rx="1.5" />
      <rect x="2.5" y="16" width="6" height="5" rx="1.5" />
      <rect x="15.5" y="16" width="6" height="5" rx="1.5" />
      <path d="M12 8v4M5.5 16v-4h13v4" />
    </svg>
  );
}

/** Sales & Market Development — a rising line against a baseline. */
function SalesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M3 20h18" />
      <path d="M6 15.5l4.5-5 3.5 3L20 6" />
      <path d="M15.5 6H20v4.5" />
    </svg>
  );
}

export const serviceIcons = {
  compass: CompassIcon,
  model: ModelIcon,
  market: MarketIcon,
  structure: StructureIcon,
  sales: SalesIcon,
} as const;

export type ServiceIconName = keyof typeof serviceIcons;
