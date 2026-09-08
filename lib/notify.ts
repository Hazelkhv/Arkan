import { company } from "@/lib/content";
import type { LeadRow } from "@/lib/leads";

/**
 * Notification of a new consultation request.
 *
 * Delivery goes through Resend. Configuration is optional on purpose: with no
 * RESEND_API_KEY set — a fresh clone, a preview deploy, a local run — the
 * notification is written to the server log instead, so a developer still sees
 * every lead and nothing has to be stubbed out to work offline.
 *
 * RESEND_FROM must sit on a domain verified in the Resend dashboard. An
 * unverified sender is rejected outright or lands in spam, which is the one
 * failure mode that looks like nothing happening at all. See .env.example.
 *
 * This must never be able to fail a submission. The lead is already stored by
 * the time it runs, and a bounced notification is an internal problem — not
 * something to show a visitor who filled the form in correctly. Every error is
 * therefore swallowed and logged here rather than propagated.
 */
export async function notifyNewLead(row: LeadRow): Promise<void> {
  const subject = `New consultation request — ${row.business_name}`;

  const body = [
    `Name:      ${row.full_name}`,
    `Phone:     ${row.phone}`,
    `Email:     ${row.email ?? "—"}`,
    `Business:  ${row.business_name}`,
    `Industry:  ${row.industry ?? "—"}`,
    `Stage:     ${row.stage}`,
    `Preferred: ${row.preferred_time ?? "—"}`,
    "",
    "Challenge:",
    row.challenge,
  ].join("\n");

  try {
    await deliver(subject, body);
  } catch (error) {
    console.error("[arkan] Lead notification failed to send:", error);
  }
}

async function deliver(subject: string, body: string): Promise<void> {
  const recipient = process.env.LEAD_NOTIFICATION_TO || company.email;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;

  if (!apiKey || !from) {
    console.warn(
      "[arkan] Resend is not configured — this lead was not emailed to anyone.",
    );
    console.info(
      `[arkan] Notification pending for ${recipient}\n${subject}\n\n${body}`,
    );
    return;
  }

  // Imported lazily so an install without the key never pays to load the SDK.
  const { Resend } = await import("resend");

  const { error } = await new Resend(apiKey).emails.send({
    from,
    to: recipient,
    subject,
    text: body,
  });

  // Resend reports a rejected send in the response rather than by throwing, so
  // this branch — not the catch in notifyNewLead — is what actually surfaces a
  // bad key or an unverified sender domain.
  if (error) {
    throw new Error(`${error.name}: ${error.message}`);
  }
}
