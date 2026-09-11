import type { ReactNode } from "react";

/**
 * The admin panel's building blocks.
 *
 * Denser than the website's — this is a tool, and an operator working through
 * forty conversations should not have to scroll past the generous white space
 * a marketing page needs. Everything still comes from the same tokens, so the
 * panel reads as the same brand at a different tempo.
 *
 * Two constraints carried over unchanged, because they are not about tempo:
 * Brass is never a border, a small label or a focus ring on a light surface
 * (2.98:1), and no status is ever signalled by colour alone — every badge
 * below says what it is in words.
 */

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-sand pb-5">
      <div>
        <h1 className="text-h2 text-pine">{title}</h1>
        {description && (
          <p className="mt-2 max-w-2xl text-caption text-slate">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  title,
  description,
  children,
  footer,
  className = "",
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-card border border-sand bg-white shadow-card ${className}`}
    >
      {(title || description) && (
        <header className="border-b border-sand px-5 py-4">
          {title && <h2 className="text-h3 text-pine">{title}</h2>}
          {description && (
            <p className="mt-1 max-w-2xl text-caption text-slate">{description}</p>
          )}
        </header>
      )}
      <div className="px-5 py-4">{children}</div>
      {footer && (
        <footer className="border-t border-sand bg-bone/60 px-5 py-3">{footer}</footer>
      )}
    </section>
  );
}

export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-card border border-sand bg-white px-5 py-4 shadow-card">
      <p className="text-eyebrow uppercase text-slate">{label}</p>
      {/* Tabular figures, per the brand guide, so a column of numbers aligns. */}
      <p className="tabular mt-2 text-h2 text-pine">{value}</p>
      {hint && <p className="mt-1 text-caption text-slate">{hint}</p>}
    </div>
  );
}

type Tone = "neutral" | "good" | "warn" | "bad";

const TONES: Record<Tone, string> = {
  neutral: "border-sand bg-sand/50 text-ink",
  good: "border-pine/30 bg-pine/[0.08] text-pine",
  warn: "border-brass/40 bg-brass/[0.12] text-ink",
  bad: "border-clay/30 bg-clay/[0.08] text-clay",
};

/**
 * A status, in words.
 *
 * The tone tints the chip; the label is what says what it means. A colour-blind
 * operator reading a list of documents sees "failed" and "ready", not two
 * shades they have to learn.
 */
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-caption font-medium ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-card border border-dashed border-sand px-5 py-8 text-center text-caption text-slate">
      {children}
    </p>
  );
}

export function Table({
  head,
  children,
}: {
  head: ReactNode[];
  children: ReactNode;
}) {
  return (
    // Wide tables scroll inside their own container; the page body never does.
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-[42rem] border-collapse text-start">
        <thead>
          <tr className="border-b border-sand">
            {head.map((cell, i) => (
              <th
                key={i}
                scope="col"
                className="whitespace-nowrap py-2 pe-4 text-start text-eyebrow uppercase text-slate"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-sand/70">{children}</tbody>
      </table>
    </div>
  );
}

export function Cell({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <td className={`py-3 pe-4 align-top text-caption ${className}`}>{children}</td>;
}

/** Label above the control, per the brand guide's form rules. */
export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-caption font-semibold text-ink">
        {label}
      </label>
      {hint && <p className="text-caption text-slate">{hint}</p>}
      {children}
    </div>
  );
}

/**
 * The input styling, as one string.
 *
 * Brass on focus is from the brand guide's form rules, and it is safe here
 * because it is a two-pixel border on white rather than text: the focus ring
 * itself stays Pine, which is what carries the 3:1 the border cannot.
 */
export const inputClass =
  "min-h-11 w-full rounded-btn border border-slate/40 bg-white px-3 py-2 text-[0.9375rem] text-ink " +
  "placeholder:text-slate/70 focus:border-brass focus:outline-none " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine " +
  "disabled:cursor-not-allowed disabled:bg-sand/40";

export const textareaClass = `${inputClass} min-h-[8rem] resize-y leading-relaxed`;

export const buttonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-btn bg-pine px-5 " +
  "text-[0.9375rem] font-semibold text-bone transition-colors duration-200 " +
  "hover:bg-[#0f2c26] disabled:cursor-not-allowed disabled:opacity-50";

export const secondaryButtonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-btn border border-pine px-5 " +
  "text-[0.9375rem] font-semibold text-pine transition-colors duration-200 " +
  "hover:bg-pine/[0.06] disabled:cursor-not-allowed disabled:opacity-50";

export const dangerButtonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-btn border border-clay/50 px-5 " +
  "text-[0.9375rem] font-semibold text-clay transition-colors duration-200 " +
  "hover:bg-clay/[0.08] disabled:cursor-not-allowed disabled:opacity-50";

/** A saved / failed line under a form, announced rather than merely shown. */
export function FormStatus({
  status,
}: {
  status?: { ok?: boolean; message?: string } | null;
}) {
  if (!status?.message) return null;

  return (
    <p
      role="status"
      className={`text-caption ${status.ok ? "text-pine" : "text-clay"}`}
    >
      {status.ok ? "✓ " : ""}
      {status.message}
    </p>
  );
}
