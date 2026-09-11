/**
 * Who may do what.
 *
 * Four capabilities rather than a permission per screen, because a matrix
 * nobody can hold in their head is one that gets a hole in it. Each is named
 * for the job it describes:
 *
 *   read     — see the dashboard, the inbox, the leads. Everybody.
 *   operate  — reply to a visitor, take a conversation over, work a lead.
 *   content  — upload to the knowledge base, edit the persona.
 *   configure— change models, keys, thresholds, channels, retention.
 *   manage   — invite and remove panel users.
 *
 * Roles are cumulative in the obvious direction, and `read_only` is the default
 * a new row gets, so an invitation that forgets to name a role grants the least.
 *
 * This module is deliberately free of server imports: the admin UI hides
 * controls a role cannot use, and it needs the same table to do it. Hiding is
 * not enforcement — every server action checks again.
 */

export const ROLES = ["owner", "admin", "editor", "operator", "read_only"] as const;

export type Role = (typeof ROLES)[number];

export type Capability = "read" | "operate" | "content" | "configure" | "manage";

const CAPABILITIES: Record<Role, Capability[]> = {
  owner: ["read", "operate", "content", "configure", "manage"],
  admin: ["read", "operate", "content", "configure"],
  editor: ["read", "content"],
  operator: ["read", "operate"],
  read_only: ["read"],
};

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Administrator",
  editor: "Content editor",
  operator: "Operator",
  read_only: "Read only",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: "Everything, including adding and removing panel users.",
  admin: "Everything except managing panel users.",
  editor: "The knowledge base and the assistant's persona.",
  operator: "Conversations, handovers and leads.",
  read_only: "Can see everything and change nothing.",
};

export function can(role: Role | null | undefined, capability: Capability): boolean {
  if (!role) return false;
  return CAPABILITIES[role]?.includes(capability) ?? false;
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
