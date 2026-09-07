"use server";

import { consultation } from "@/lib/content";
import { notifyNewLead, saveLead, toLeadRow } from "@/lib/server-leads";
import {
  consultationSchema,
  toFieldErrors,
  type FieldErrors,
} from "@/lib/validation";

export type FormState = {
  status: "idle" | "invalid" | "error" | "success";
  fieldErrors?: FieldErrors;
  message?: string;
};

export const initialFormState: FormState = { status: "idle" };

/**
 * Handles a consultation request.
 *
 * The browser validates too, but everything is re-validated here against the
 * same schema — client-side checks are a convenience, not a guarantee.
 *
 * Order matters: the lead is stored first and only then is a notification
 * attempted, because a notification that fails must never cost us the lead.
 */
export async function submitConsultation(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = consultationSchema.safeParse({
    fullName: formData.get("fullName") ?? "",
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
    businessName: formData.get("businessName") ?? "",
    industry: formData.get("industry") ?? "",
    stage: formData.get("stage") ?? "",
    challenge: formData.get("challenge") ?? "",
    preferredTime: formData.get("preferredTime") ?? "",
  });

  if (!parsed.success) {
    return { status: "invalid", fieldErrors: toFieldErrors(parsed.error) };
  }

  const row = toLeadRow(parsed.data);

  try {
    const result = await saveLead(row);

    if (!result.ok) {
      return { status: "error", message: consultation.errorMessage };
    }

    await notifyNewLead(row);

    return { status: "success" };
  } catch (error) {
    console.error("[arkan] Consultation submission failed:", error);
    return { status: "error", message: consultation.errorMessage };
  }
}
