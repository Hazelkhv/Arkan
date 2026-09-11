import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Brand guide, section 7:
 *   Primary   — Pine background, Bone text, 8px radius,
 *               hover: slightly darker with a Brass underline.
 *   Secondary — Pine border, transparent background.
 *
 * Every variant clears a 44px minimum touch target.
 */

type Variant = "primary" | "secondary";
type Size = "md" | "sm";

const BASE =
  "group relative inline-flex items-center justify-center gap-2 rounded-btn " +
  "font-semibold whitespace-nowrap transition-colors duration-200 " +
  "disabled:cursor-not-allowed disabled:opacity-60";

const SIZES: Record<Size, string> = {
  md: "min-h-12 px-7 text-[1.0625rem]",
  sm: "min-h-11 px-5 text-[0.9375rem]",
};

const VARIANTS: Record<Variant, string> = {
  primary: "bg-pine text-bone hover:bg-[#0f2c26]",
  secondary:
    "border border-pine text-pine hover:bg-pine/[0.06] focus-visible:bg-pine/[0.06]",
};

function Inner({ children, variant }: { children: ReactNode; variant: Variant }) {
  // The Brass underline is specified for the primary button only: on Pine it
  // measures 3.8:1, whereas on Bone it would fall to 2.98:1 and read as smudge.
  if (variant !== "primary") return <>{children}</>;

  return (
    <span className="relative">
      {children}
      <span
        aria-hidden="true"
        className="absolute -bottom-1 left-0 h-px w-full origin-left scale-x-0 bg-brass transition-transform duration-200 group-hover:scale-x-100"
      />
    </span>
  );
}

type ButtonProps = {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
};

/**
 * next/link rather than a bare anchor, because these hrefs are now rooted
 * (`/#contact`) so the same header works on the home page and on /consultant.
 * A plain anchor to a route would reload the whole document; Link navigates.
 * A bare fragment and an external URL both still behave as ordinary links.
 */
export function ButtonLink({
  variant = "primary",
  size = "md",
  className = "",
  href,
  children,
  ...props
}: ButtonProps &
  AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <Link
      href={href}
      className={`${BASE} ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      <Inner variant={variant}>{children}</Inner>
    </Link>
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}: ButtonProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`${BASE} ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      <Inner variant={variant}>{children}</Inner>
    </button>
  );
}
