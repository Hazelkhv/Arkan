/**
 * The follow-up states a lead moves through.
 *
 * Outside the "use server" module that uses them, because a Server Action file
 * may only export async functions — the same constraint that put
 * `initialFormState` in lib/form-state.ts rather than in app/actions.ts.
 *
 * These are the firm's pipeline, not the assistant's: a lead from the website
 * form and a lead the assistant captured are worked the same way, and they are
 * in the same list precisely so that stays true.
 */

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "consultation_booked",
  "closed",
  "not_a_fit",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  consultation_booked: "Consultation booked",
  closed: "Closed",
  not_a_fit: "Not a fit",
};

export function isLeadStatus(value: unknown): value is LeadStatus {
  return typeof value === "string" && (LEAD_STATUSES as readonly string[]).includes(value);
}
