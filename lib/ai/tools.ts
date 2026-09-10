import { requireAdminClient } from "@/lib/ai/admin-client";
import type { ToolDefinition } from "@/lib/ai/generate";
import type { Channel } from "@/lib/ai/types";

/**
 * What the assistant can do besides talk.
 *
 * Two tools, matching the two moments where a conversation stops being a
 * conversation: the visitor is ready to be contacted, or they need a person.
 * Both are deliberately narrow — the bot books and escalates, it never edits or
 * reads anything back out.
 */

export const CAPTURE_LEAD = "capture_lead";
export const REQUEST_HUMAN = "request_human";

export const toolDefinitions: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: CAPTURE_LEAD,
      description:
        "Record a consultation request once the visitor has agreed to be contacted and has given their details. " +
        "Only call this after they have confirmed they want the team to contact them. Never invent a value: " +
        "if you do not have a required detail, ask for it in your reply instead of calling this.",
      parameters: {
        type: "object",
        properties: {
          full_name: { type: "string", description: "The visitor's full name." },
          phone: {
            type: "string",
            description: "A phone number the team can reach them on.",
          },
          email: { type: "string", description: "Email address, if given." },
          business_name: { type: "string", description: "Their company name." },
          industry: { type: "string", description: "Their industry, if given." },
          stage: {
            type: "string",
            enum: ["Idea", "Early-stage", "Growing", "Established"],
            description: "The stage their business is at.",
          },
          challenge: {
            type: "string",
            description:
              "The growth challenge in their own words, drawn from the conversation.",
          },
          preferred_time: {
            type: "string",
            enum: ["Morning", "Afternoon", "Evening"],
            description: "When they prefer to be contacted, if stated.",
          },
        },
        required: ["full_name", "phone", "business_name", "stage", "challenge"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: REQUEST_HUMAN,
      description:
        "Flag this conversation for a member of the Arkan team. Call this when the visitor asks for a person, " +
        "when they are unhappy, or when the question needs judgement you should not give.",
      parameters: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            description: "One short sentence on why a person is needed.",
          },
        },
        required: ["reason"],
        additionalProperties: false,
      },
    },
  },
];

export type ToolOutcome = {
  leadCaptured: boolean;
  handoff: boolean;
  /** What the model is told happened, so its next turn is accurate. */
  result: string;
};

/**
 * Runs a tool call.
 *
 * Arguments come from a language model, so nothing here trusts them: the shape
 * is re-checked, strings are trimmed and length-capped to the column widths the
 * website form validates against, and an unparseable payload is reported back
 * to the model rather than thrown. A tool failure must not break the reply.
 */
export async function runTool(
  name: string,
  rawArguments: string,
  context: { conversationId: string; channel: Channel },
): Promise<ToolOutcome> {
  let args: Record<string, unknown>;

  try {
    args = JSON.parse(rawArguments || "{}");
  } catch {
    return {
      leadCaptured: false,
      handoff: false,
      result: "That tool call was not valid JSON. Ask the visitor for the details again.",
    };
  }

  switch (name) {
    case CAPTURE_LEAD:
      return captureLead(args, context);
    case REQUEST_HUMAN:
      return requestHuman(args, context);
    default:
      return {
        leadCaptured: false,
        handoff: false,
        result: `Unknown tool: ${name}.`,
      };
  }
}

const text = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
};

async function captureLead(
  args: Record<string, unknown>,
  context: { conversationId: string; channel: Channel },
): Promise<ToolOutcome> {
  const fullName = text(args.full_name, 120);
  const phone = text(args.phone, 40);
  const businessName = text(args.business_name, 160);
  const challenge = text(args.challenge, 2000);
  const stage = text(args.stage, 40);

  const missing = [
    !fullName && "name",
    !phone && "phone number",
    !businessName && "business name",
    !challenge && "challenge",
    !stage && "business stage",
  ].filter(Boolean);

  if (missing.length) {
    return {
      leadCaptured: false,
      handoff: false,
      result: `Not saved — still missing: ${missing.join(", ")}. Ask for those before trying again.`,
    };
  }

  const supabase = requireAdminClient();

  const { error } = await supabase.from("leads").insert({
    full_name: fullName,
    phone,
    email: text(args.email, 160),
    business_name: businessName,
    industry: text(args.industry, 120),
    stage,
    challenge,
    preferred_time: text(args.preferred_time, 40),
    source: context.channel === "telegram" ? "telegram" : "chatbot",
    conversation_id: context.conversationId,
  });

  if (error) {
    console.error("[arkan] Lead capture from the assistant failed:", error.message);

    return {
      leadCaptured: false,
      handoff: true,
      result:
        "The request could not be saved. Apologise briefly, and tell them the team has been notified and will follow up.",
    };
  }

  return {
    leadCaptured: true,
    handoff: false,
    result:
      "Saved. Confirm it back to them and say the team will be in touch within 24 business hours. The first conversation is free.",
  };
}

async function requestHuman(
  args: Record<string, unknown>,
  context: { conversationId: string },
): Promise<ToolOutcome> {
  const supabase = requireAdminClient();

  await supabase
    .from("conversations")
    .update({ status: "needs_human", updated_at: new Date().toISOString() })
    .eq("id", context.conversationId);

  await supabase.from("audit_log").insert({
    action: "assistant.handoff_requested",
    target: context.conversationId,
    detail: { reason: text(args.reason, 500) ?? "unstated" },
  });

  return {
    leadCaptured: false,
    handoff: true,
    result:
      "Flagged for the team. Tell the visitor a colleague will pick this up, and offer to take their contact details in the meantime.",
  };
}
