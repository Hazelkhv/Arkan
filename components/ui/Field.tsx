"use client";

import type { ChangeEvent, FocusEvent, ReactNode } from "react";

/**
 * Form fields.
 *
 * Brand guide, section 7: white background, thin Slate border, Brass border on
 * focus, label above the field. Slate on white is 6.52:1 and Brass on white is
 * 3.29:1, so both clear the 3:1 floor for a control boundary. The error border
 * is Clay at 7.56:1.
 *
 * Accessibility contract, shared by all three field types:
 *   - a real <label> bound by `for`
 *   - required stated in words, never by colour or a bare asterisk alone
 *   - `aria-invalid` while a field is in error
 *   - `aria-describedby` pointing at the message, so a screen reader reads it
 *     when focus enters the field
 *
 * The inline message carries no `role="alert"` on purpose: on a failed submit
 * the error summary above the form takes focus and is announced once, and
 * eight simultaneous alerts would talk over it.
 */

export function fieldId(name: string) {
  return `field-${name}`;
}

function errorId(name: string) {
  return `${fieldId(name)}-error`;
}

const CONTROL =
  "w-full rounded-btn border bg-white px-4 text-body text-ink " +
  "placeholder:text-slate/70 transition-colors duration-200 " +
  "focus:border-brass focus:outline-none";

function controlClasses(hasError: boolean, extra = "") {
  return `${CONTROL} ${hasError ? "border-clay" : "border-slate"} ${extra}`;
}

type Shared = {
  name: string;
  label: string;
  value: string;
  error?: string;
  required?: boolean;
  onChange: (name: string, value: string) => void;
  onBlur: (name: string, value: string) => void;
};

function Shell({
  name,
  label,
  required,
  error,
  children,
}: {
  name: string;
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={fieldId(name)}
        className="mb-2 block text-caption font-medium text-pine"
      >
        {label}
        {required ? (
          <span className="ml-1.5 font-normal text-slate">(required)</span>
        ) : (
          <span className="ml-1.5 font-normal text-slate">(optional)</span>
        )}
      </label>

      {children}

      {error ? (
        <p id={errorId(name)} className="mt-2 text-caption text-clay">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(name: string, error?: string) {
  return error ? errorId(name) : undefined;
}

export function TextField({
  type = "text",
  placeholder,
  autoComplete,
  inputMode,
  ...field
}: Shared & {
  type?: "text" | "email" | "tel";
  placeholder?: string;
  autoComplete?: string;
  inputMode?: "text" | "email" | "tel";
}) {
  return (
    <Shell {...field}>
      <input
        id={fieldId(field.name)}
        name={field.name}
        type={type}
        value={field.value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        aria-invalid={field.error ? true : undefined}
        aria-describedby={describedBy(field.name, field.error)}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          field.onChange(field.name, event.target.value)
        }
        onBlur={(event: FocusEvent<HTMLInputElement>) =>
          field.onBlur(field.name, event.target.value)
        }
        className={controlClasses(Boolean(field.error), "h-12")}
      />
    </Shell>
  );
}

export function TextAreaField({
  placeholder,
  rows = 5,
  ...field
}: Shared & { placeholder?: string; rows?: number }) {
  return (
    <Shell {...field}>
      <textarea
        id={fieldId(field.name)}
        name={field.name}
        rows={rows}
        value={field.value}
        placeholder={placeholder}
        aria-invalid={field.error ? true : undefined}
        aria-describedby={describedBy(field.name, field.error)}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
          field.onChange(field.name, event.target.value)
        }
        onBlur={(event: FocusEvent<HTMLTextAreaElement>) =>
          field.onBlur(field.name, event.target.value)
        }
        className={controlClasses(Boolean(field.error), "py-3 leading-relaxed")}
      />
    </Shell>
  );
}

export function SelectField({
  options,
  placeholder,
  ...field
}: Shared & { options: readonly string[]; placeholder: string }) {
  return (
    <Shell {...field}>
      <div className="relative">
        <select
          id={fieldId(field.name)}
          name={field.name}
          value={field.value}
          aria-invalid={field.error ? true : undefined}
          aria-describedby={describedBy(field.name, field.error)}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => {
            field.onChange(field.name, event.target.value);
            // A select has no meaningful "blur to finish typing" moment;
            // choosing an option is the completed interaction.
            field.onBlur(field.name, event.target.value);
          }}
          onBlur={(event: FocusEvent<HTMLSelectElement>) =>
            field.onBlur(field.name, event.target.value)
          }
          className={controlClasses(
            Boolean(field.error),
            "h-12 appearance-none pr-11",
          )}
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>

        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
          className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
    </Shell>
  );
}
