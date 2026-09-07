import { company } from "@/lib/content";
import type { LeadRow } from "@/lib/leads";

/**
 * Notification of a new consultation request.
 *
 * ── Integration point ──────────────────────────────────────────────────────
 * No email provider is configured in this project. To add one — Resend,
 * Postmark, SendGrid, SMTP, anything — install its SDK and replace the body of
 * `deliver()` below. Read credentials from environment variables only; never
 * commit a key.
 *
 *   Example (Resend):
 *     const { Resend } = await import("resend");
 *     await new Resend(process.env.RESEND_API_KEY).emails.send({
 *       from: "Arkan Website <website@arkan.co>",
 *       to: process.env.LEAD_NOTIFICATION_TO!,
 *       subject,
 *       text: body,
 *     });
 * ───────────────────────────────────────────────────────────────────────────
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
  const recipient = process.env.LEAD_NOTIFICATION_TO ?? company.email;

  // Replace this with a real provider call. Until then the notification is
  // written to the server log so nothing is silently dropped.
  console.info(
    `[arkan] Notification pending for ${recipient}\n${subject}\n\n${body}`,
  );
}
