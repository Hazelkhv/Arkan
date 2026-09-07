"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { initialFormState, submitConsultation } from "@/app/actions";
import {
  SelectField,
  TextAreaField,
  TextField,
  fieldId,
} from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { PillarMark } from "@/components/ui/PillarMark";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { businessStages, consultation, contactTimes } from "@/lib/content";
import {
  fieldOrder,
  validateField,
  type FieldErrors,
  type FieldName,
} from "@/lib/validation";

const EMPTY: Record<FieldName, string> = {
  fullName: "",
  phone: "",
  email: "",
  businessName: "",
  industry: "",
  stage: "",
  challenge: "",
  preferredTime: "",
};

const REQUIRED: FieldName[] = [
  "fullName",
  "phone",
  "businessName",
  "stage",
  "challenge",
];

const LABELS = consultation.fields;

/**
 * The consultation request form — the page's only conversion point.
 *
 * Inputs are controlled so that a failed submit never wipes what was typed
 * (React resets uncontrolled forms once an action resolves).
 *
 * Errors arrive from two places and are held in one piece of state: the browser
 * validates each field on blur for immediate feedback, and the Server Action
 * returns the authoritative set on submit. Because the form still posts through
 * `action`, it keeps working with JavaScript disabled.
 */
export function ConsultationForm() {
  const [state, formAction, isPending] = useActionState(
    submitConsultation,
    initialFormState,
  );

  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const summaryRef = useRef<HTMLDivElement>(null);

  // A rejected submit replaces the local errors and moves focus to the summary,
  // so keyboard and screen reader users land on the explanation rather than
  // being left at the bottom of the form wondering what happened.
  useEffect(() => {
    if (state.status !== "invalid" || !state.fieldErrors) return;
    setErrors(state.fieldErrors);
    summaryRef.current?.focus();
  }, [state]);

  function handleChange(name: string, value: string) {
    const field = name as FieldName;
    setValues((current) => ({ ...current, [field]: value }));

    // Only re-check a field that is already showing an error, so a message
    // disappears the moment it is fixed but none appear while still typing.
    setErrors((current) => {
      if (!current[field]) return current;
      if (validateField(field, value, { ...values, [field]: value })) {
        return current;
      }

      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function handleBlur(name: string, value: string) {
    const field = name as FieldName;
    const message = validateField(field, value, { ...values, [field]: value });

    setErrors((current) => {
      const next = { ...current };
      if (message) next[field] = message;
      else delete next[field];
      return next;
    });
  }

  const listedErrors = fieldOrder
    .filter((name) => errors[name])
    .map((name) => ({ name, message: errors[name] as string }));

  const shared = (name: FieldName) => ({
    name,
    value: values[name],
    error: errors[name],
    required: REQUIRED.includes(name),
    onChange: handleChange,
    onBlur: handleBlur,
  });

  if (state.status === "success") {
    return (
      <section id="contact" className="bg-sand">
        <div className="mx-auto max-w-[75rem] px-5 py-20 sm:px-8 sm:py-24">
          <div className="mx-auto max-w-xl rounded-card border border-pine/15 bg-white p-8 text-center shadow-card sm:p-12">
            <PillarMark active={3} className="mx-auto h-7 w-8" />
            <h2 className="mt-6 text-h2 text-pine">
              {consultation.successTitle}
            </h2>
            <p className="mt-4 text-body text-slate">
              {consultation.successMessage}
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="contact" className="bg-sand">
      <div className="mx-auto max-w-[75rem] px-5 py-20 sm:px-8 sm:py-24">
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          <div data-reveal>
            <SectionHeading
              eyebrow={consultation.eyebrow}
              heading={consultation.heading}
              intro={consultation.intro}
            />
            <p className="mt-6 text-caption text-slate">
              {consultation.requiredNote}
            </p>
          </div>

          <form
            action={formAction}
            noValidate
            className="rounded-card border border-pine/10 bg-white p-6 shadow-card sm:p-9"
          >
            {listedErrors.length > 0 ? (
              <div
                ref={summaryRef}
                tabIndex={-1}
                role="alert"
                className="mb-8 rounded-btn border border-clay bg-clay/[0.04] p-5"
              >
                <h3 className="text-body font-semibold text-clay">
                  {consultation.errorSummaryTitle}
                </h3>
                <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5">
                  {listedErrors.map((item) => (
                    <li key={item.name}>
                      <a
                        href={`#${fieldId(item.name)}`}
                        className="text-caption text-clay underline underline-offset-4"
                      >
                        {item.message}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {state.status === "error" ? (
              <p
                role="alert"
                className="mb-8 rounded-btn border border-clay bg-clay/[0.04] p-5 text-body text-clay"
              >
                {state.message ?? consultation.errorMessage}
              </p>
            ) : null}

            <div className="grid gap-6 sm:grid-cols-2">
              <TextField
                {...shared("fullName")}
                label={LABELS.fullName.label}
                placeholder={LABELS.fullName.placeholder}
                autoComplete="name"
              />
              <TextField
                {...shared("phone")}
                label={LABELS.phone.label}
                placeholder={LABELS.phone.placeholder}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
              />
              <TextField
                {...shared("email")}
                label={LABELS.email.label}
                placeholder={LABELS.email.placeholder}
                type="email"
                inputMode="email"
                autoComplete="email"
              />
              <TextField
                {...shared("businessName")}
                label={LABELS.businessName.label}
                placeholder={LABELS.businessName.placeholder}
                autoComplete="organization"
              />
              <TextField
                {...shared("industry")}
                label={LABELS.industry.label}
                placeholder={LABELS.industry.placeholder}
              />
              <SelectField
                {...shared("stage")}
                label={LABELS.stage.label}
                placeholder={LABELS.stage.placeholder}
                options={businessStages}
              />

              <div className="sm:col-span-2">
                <TextAreaField
                  {...shared("challenge")}
                  label={LABELS.challenge.label}
                  placeholder={LABELS.challenge.placeholder}
                />
              </div>

              <SelectField
                {...shared("preferredTime")}
                label={LABELS.preferredTime.label}
                placeholder={LABELS.preferredTime.placeholder}
                options={contactTimes}
              />
            </div>

            <Button
              type="submit"
              disabled={isPending}
              className="mt-8 w-full sm:w-auto"
            >
              {isPending
                ? consultation.submittingLabel
                : consultation.submitLabel}
            </Button>
          </form>
        </div>
      </div>
    </section>
  );
}
