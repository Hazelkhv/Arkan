import { requireAdminDb } from "@/lib/ai/admin-client";
import type { Channel } from "@/lib/ai/types";
import { businessStages, contactTimes } from "@/lib/content";
import { notifyNewLead, saveLead, toLeadRow } from "@/lib/server-leads";
import { consultationSchema, toFieldErrors } from "@/lib/validation";
import type { ToolCall, ToolDefinition } from "@/lib/ai/generate";

/**
 * The two things the assistant can actually do.
 *
 * Everything else it does is talk. These are the points where a conversation
 * turns into something the firm acts on, which is why both are deliberate tool
 * calls rather than something inferred from the text of an answer.
 *
 * capture_lead writes to the same `leads` table as the website form, through
 * the same validation and the same save-then-notify order. That is not
 * convenience: a second lead path with its own rules would drift from the first
 * one, and the drift would only be discovered as a missing lead.
 */

export type ToolContext = {
  conversationId: string;
  channel: Channel;
};

export type ToolResult = {
  /** Returned to the model as the tool message. */
  content: string;
  /** Shown to the visitor while the tool runs, and after. */
  label: string;
  /** Set by request_human; the engine flips the conversation over to a person. */
  handoffReason?: string;
  /** True once a lead row exists, so the UI can stop offering the form. */
  leadCaptured?: boolean;
};

export const toolDefinitions: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "capture_lead",
      description:
        "Record a consultation request. Call this only once you have the " +
        "person's name, phone number, business name, business stage and a " +
        "description of their challenge — ask for them conversationally " +
        "first, never as a list of form fields. Do not call it speculatively.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          fullName: { type: "string", description: "The person's full name." },
          phone: {
            type: "string",
            description: "A phone number the team can reach them on.",
          },
          businessName: { type: "string", description: "Their company name." },
          stage: {
            type: "string",
            enum: [...businessStages],
            description: "Which stage their business is at.",
          },
          challenge: {
            type: "string",
            description:
              "Their biggest current challenge, in their own words where possible.",
          },
          email: { type: "string", description: "Email address, if offered." },
          industry: { type: "string", description: "Industry, if mentioned." },
          preferredTime: {
            type: "string",
            enum: [...contactTimes],
            description: "When they would prefer to be called, if stated.",
          },
        },
        required: ["fullName", "phone", "businessName", "stage", "challenge"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "request_human",
      description:
        "Hand the conversation to a person. Use it when the visitor asks to " +
        "speak to someone, is unhappy, or raises something outside what you " +
        "can answer. Tell them a colleague will follow up; do not claim the " +
        "handover has already happened.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          reason: {
            type: "string",
            description:
              "One sentence an operator can triage from, in the third person.",
          },
        },
        required: ["reason"],
      },
    },
  },
];

export async function runTool(
  call: ToolCall,
  context: ToolContext,
): Promise<ToolResult> {
  const args = parseArguments(call.function.arguments);

  switch (call.function.name) {
    case "capture_lead":
      return captureLead(args, context);
    case "request_human":
      return requestHuman(args, context);
    default:
      return {
        content: `Unknown tool: ${call.function.name}`,
        label: "Unavailable",
      };
  }
}

/**
 * Models emit tool arguments as a JSON string, and occasionally as a malformed
 * one — a truncated stream, or a stray prose sentence around the object. An
 * empty object lets validation produce a useful "what is missing" message
 * instead of the turn failing with a parse error.
 */
function parseArguments(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

async function captureLead(
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  // The same schema the browser and the Server Action use. A lead the form
  // would reject is a lead the assistant must reject too.
  const parsed = consultationSchema.safeParse({
    fullName: str(args.fullName),
    phone: str(args.phone),
    email: str(args.email),
    businessName: str(args.businessName),
    industry: str(args.industry),
    stage: str(args.stage),
    challenge: str(args.challenge),
    preferredTime: str(args.preferredTime),
  });

  if (!parsed.success) {
    const problems = Object.entries(toFieldErrors(parsed.error))
      .map(([field, message]) => `${field}: ${message}`)
      .join("; ");

    // Returned to the model, not to the visitor: it should ask for the missing
    // detail in its own words rather than reciting a validation error.
    return {
      content:
        `The request was not saved. Ask the visitor for what is missing or ` +
        `unclear, then call capture_lead again. Problems — ${problems}`,
      label: "Consultation request incomplete",
    };
  }

  const row = {
    ...toLeadRow(parsed.data),
    source: context.channel,
    conversation_id: context.conversationId,
  };

  // Store first, notify second — and never let a failed notification cost the
  // lead. The website's Server Action makes exactly this trade for exactly this
  // reason; see app/actions.ts.
  const result = await saveLead(row);

  if (!result.ok) {
    return {
      content:
        "Saving the request failed. Apologise briefly, and give the visitor " +
        "the email address and phone number so they can reach the team directly.",
      label: "Could not save the request",
    };
  }

  await notifyNewLead(row);

  return {
    content:
      "The consultation request was saved. Confirm it in one sentence and " +
      "tell them the team will be in touch within 24 business hours. The " +
      "first conversation is free. Do not ask for the same details again.",
    label: "Consultation request sent",
    leadCaptured: true,
  };
}

async function requestHuman(
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  const reason = str(args.reason) || "The visitor asked to speak to a person.";

  const db = requireAdminDb();

  const { error } = await db
    .from("conversations")
    .update({
      status: "needs_human",
      handoff_reason: reason.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq("id", context.conversationId)
    // Never demote a conversation an operator has already taken over: they are
    // mid-reply, and the queue would show it as untouched.
    .eq("status", "active");

  if (error) {
    console.error("[arkan] Could not flag a conversation for handoff:", error.message);
  }

  return {
    content:
      "A colleague has been notified and will follow up. Tell the visitor " +
      "that, ask for the best way to reach them if you do not already have " +
      "it, and stay helpful in the meantime.",
    label: "Passed to the team",
    handoffReason: reason,
  };
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
