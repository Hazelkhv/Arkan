"use server";

import { revalidatePath } from "next/cache";
import { requireAdminDb } from "@/lib/ai/admin-client";
import { audit, requireAdmin } from "@/lib/admin/auth";
import { isRole } from "@/lib/admin/roles";

/**
 * Who can get into the panel.
 *
 * Access is a row in `admin_users`, not a password, so granting it is an insert
 * and revoking it is a delete. Signing in with Supabase Auth proves an email
 * address and grants nothing on its own — the login form refuses to send a link
 * to an address that has no row here.
 *
 * Two rules are enforced rather than trusted:
 *
 *   1. Nobody can change or remove their own role. An owner who demotes
 *      themselves by accident has locked the last owner out of the only screen
 *      that could put them back.
 *   2. The last owner cannot be removed or demoted. There is no support desk to
 *      call, and no second way into this table.
 */

export type ActionState = { ok?: boolean; message?: string };

export async function inviteUser(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin("manage");

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "read_only");

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { message: "That is not an email address." };
  }

  if (!isRole(role)) return { message: "That is not a role." };

  const db = requireAdminDb();

  const { data: existing } = await db
    .from("admin_users")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existing) return { message: "That address already has access." };

  // The id has to be filled in now and is corrected on their first sign-in,
  // when Supabase Auth finally has a user id for this address. See currentAdmin.
  const { error } = await db.from("admin_users").insert({
    id: crypto.randomUUID(),
    email,
    name: name || null,
    role,
  });

  if (error) return { message: error.message };

  await audit(admin, "user.invite", email, { role });
  revalidatePath("/admin/users");

  return {
    ok: true,
    message: `${email} can now request a sign-in link. Tell them to use the login page — no invitation email is sent.`,
  };
}

export async function changeRole(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin("manage");

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "");

  if (!isRole(role)) return { message: "That is not a role." };
  if (email === admin.email) return { message: "You cannot change your own role." };

  const db = requireAdminDb();

  if (await wouldRemoveTheLastOwner(email, role)) {
    return { message: "That is the last owner. Promote somebody else first." };
  }

  const { error } = await db.from("admin_users").update({ role }).eq("email", email);
  if (error) return { message: error.message };

  await audit(admin, "user.role", email, { role });
  revalidatePath("/admin/users");

  return { ok: true, message: "Role changed." };
}

export async function revokeUser(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin("manage");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (email === admin.email) return { message: "You cannot remove your own access." };

  if (await wouldRemoveTheLastOwner(email, null)) {
    return { message: "That is the last owner. Promote somebody else first." };
  }

  const { error } = await requireAdminDb().from("admin_users").delete().eq("email", email);
  if (error) return { message: error.message };

  // The audit row survives: it stores the actor's email as well as their id,
  // precisely so a trail does not disappear with the account it records.
  await audit(admin, "user.revoke", email);
  revalidatePath("/admin/users");

  return { ok: true, message: `${email} no longer has access.` };
}

/** True when this change would leave the panel with no owner at all. */
async function wouldRemoveTheLastOwner(
  email: string,
  newRole: string | null,
): Promise<boolean> {
  if (newRole === "owner") return false;

  const db = requireAdminDb();

  const { data: target } = await db
    .from("admin_users")
    .select("role")
    .eq("email", email)
    .maybeSingle();

  if ((target as { role?: string } | null)?.role !== "owner") return false;

  const { count } = await db
    .from("admin_users")
    .select("id", { count: "exact", head: true })
    .eq("role", "owner");

  return (count ?? 0) <= 1;
}
