import { z } from "zod";
import { businessStages, contactTimes } from "@/lib/content";

/**
 * One schema, used by both the browser and the Server Action.
 *
 * Client-side validation is a convenience; the server re-validates the same
 * payload because nothing arriving over the wire can be trusted.
 *
 * Messages are written the way the brand guide writes: plain, short, and about
 * the reader's task — never about the code that produced them.
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "This is longer than we can store. Please shorten it.")
    .optional();

export const consultationSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, "Please enter your full name.")
    .max(120, "This is longer than we can store. Please shorten it."),

  phone: z
    .string()
    .trim()
    .min(1, "Please enter your phone number.")
    .max(40, "This is longer than we can store. Please shorten it.")
    .refine(
      (value) => (value.match(/\d/g) ?? []).length >= 7,
      "Please enter a phone number we can reach you on.",
    ),

  email: z
    .union([
      z.literal(""),
      z
        .string()
        .trim()
        .email("Please enter a valid email address.")
        .max(160, "This is longer than we can store. Please shorten it."),
    ])
    .optional(),

  businessName: z
    .string()
    .trim()
    .min(1, "Please enter your business name.")
    .max(160, "This is longer than we can store. Please shorten it."),

  industry: optionalText(120),

  stage: z.enum(businessStages, {
    message: "Please select your business stage.",
  }),

  challenge: z
    .string()
    .trim()
    .min(1, "Please describe your current challenge.")
    .max(2000, "Please keep this under 2000 characters."),

  preferredTime: z
    .union([z.literal(""), z.enum(contactTimes)])
    .optional(),
});

export type ConsultationInput = z.infer<typeof consultationSchema>;

/** The field order the error summary and focus management follow. */
export const fieldOrder = [
  "fullName",
  "phone",
  "email",
  "businessName",
  "industry",
  "stage",
  "challenge",
  "preferredTime",
] as const;

export type FieldName = (typeof fieldOrder)[number];

export type FieldErrors = Partial<Record<FieldName, string>>;

/** Flattens a Zod failure into one message per field, in form order. */
export function toFieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};

  for (const issue of error.issues) {
    const name = issue.path[0] as FieldName | undefined;
    if (!name || errors[name]) continue;
    errors[name] = issue.message;
  }

  return errors;
}

/** Validates a single field without surfacing errors for the rest of the form. */
export function validateField(
  name: FieldName,
  value: string,
  form: Record<string, string>,
): string | undefined {
  const result = consultationSchema.safeParse({ ...form, [name]: value });
  if (result.success) return undefined;
  return toFieldErrors(result.error)[name];
}
