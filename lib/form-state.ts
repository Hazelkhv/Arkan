import type { FieldErrors } from "@/lib/validation";

/**
 * State shared between the form and its Server Action.
 *
 * This lives outside app/actions.ts on purpose: a "use server" module may only
 * export async functions, so the initial-state object cannot live there.
 */
export type FormState = {
  status: "idle" | "invalid" | "error" | "success";
  fieldErrors?: FieldErrors;
  message?: string;
};

export const initialFormState: FormState = { status: "idle" };
