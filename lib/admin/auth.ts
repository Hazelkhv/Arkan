import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdminDb } from "@/lib/ai/admin-client";
import { can, isRole, type Capability, type Role } from "@/lib/admin/roles";

/**
 * Who is signed in to the admin panel, and what they are allowed to do.
 *
 * Two clients, two jobs, and keeping them apart is the whole design:
 *
 *   - Supabase Auth, through the publishable key and a cookie, answers "which
 *     email address is this?". It is the only thing the browser participates in.
 *   - The service role client answers "is that address allowed in?", by reading
 *     `admin_users`. That table has RLS enabled with no policy, so a signed-in
 *     stranger cannot read it, cannot add themselves to it, and cannot see that
 *     it exists.
 *
 * Signing in therefore proves an identity and grants nothing. Access is a row
 * in a table only the server can write, which is what makes revoking somebody's
 * access a delete rather than a password change.
 */

export type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
};

export function authClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "The admin panel needs NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY: Supabase Auth is what signs an " +
        "operator in. See .env.example.",
    );
  }

  return createServerClient(url, key, {
    cookies: {
      async getAll() {
        return (await cookies()).getAll();
      },
      async setAll(list) {
        try {
          const store = await cookies();
          for (const { name, value, options } of list) {
            store.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies. proxy.ts refreshes the
          // session for /admin, so this path losing a write is harmless.
        }
      },
    },
  });
}

export async function currentAdmin(): Promise<AdminUser | null> {
  let email: string | undefined;
  let userId: string | undefined;

  try {
    const { data } = await authClient().auth.getUser();
    email = data.user?.email?.toLowerCase();
    userId = data.user?.id;
  } catch {
    return null;
  }

  if (!email || !userId) return null;

  const db = requireAdminDb();

  const { data: row } = await db
    .from("admin_users")
    .select("id, email, name, role, is_active")
    .eq("email", email)
    .maybeSingle();

  const record = row as
    | { id: string; email: string; name: string | null; role: string; is_active: boolean }
    | null;

  if (record) {
    if (!record.is_active) return null;

    // The row is keyed by auth.users.id. A first sign-in from a bootstrapped or
    // invited row has a placeholder id until now.
    if (record.id !== userId) {
      await db.from("admin_users").update({ id: userId }).eq("email", email);
    }

    await db
      .from("admin_users")
      .update({ last_login_at: new Date().toISOString() })
      .eq("email", email);

    return {
      id: userId,
      email: record.email,
      name: record.name,
      role: isRole(record.role) ? record.role : "read_only",
    };
  }

  return bootstrap(userId, email);
}

/**
 * The first owner.
 *
 * `admin_users` starts empty, and nothing in the panel can add a row to it
 * without a signed-in owner — so somebody has to be let in first. That somebody
 * is ADMIN_BOOTSTRAP_EMAIL, and only while the table is still empty. Once one
 * owner exists the variable does nothing at all, which means leaving it set in
 * production is not a way back in.
 */
async function bootstrap(userId: string, email: string): Promise<AdminUser | null> {
  const expected = (process.env.ADMIN_BOOTSTRAP_EMAIL || "").trim().toLowerCase();
  if (!expected || expected !== email) return null;

  const db = requireAdminDb();

  const { count } = await db
    .from("admin_users")
    .select("id", { count: "exact", head: true });

  if ((count ?? 0) > 0) {
    console.warn(
      "[arkan] ADMIN_BOOTSTRAP_EMAIL was presented but the panel already has " +
        "users. Add this address from Panel users instead.",
    );
    return null;
  }

  const { error } = await db.from("admin_users").insert({
    id: userId,
    email,
    role: "owner",
    name: "Owner",
  });

  if (error) {
    console.error("[arkan] Could not create the first owner:", error.message);
    return null;
  }

  await audit({ id: userId, email, name: "Owner", role: "owner" }, "admin.bootstrap", email);

  return { id: userId, email, name: "Owner", role: "owner" };
}

/**
 * The guard every admin page and every admin action starts with.
 *
 * Redirects rather than throws, so an expired session lands on the login form
 * instead of an error page. `capability` is checked here as well as in the UI:
 * hiding a button is a courtesy, and this is the part that is load-bearing.
 */
export async function requireAdmin(capability: Capability = "read"): Promise<AdminUser> {
  const admin = await currentAdmin();

  if (!admin) redirect("/admin/login");
  if (!can(admin.role, capability)) redirect("/admin?denied=1");

  return admin;
}

/**
 * Records what an operator did.
 *
 * The actor's email is stored alongside the id because the id is nulled when an
 * account is deleted, and an audit trail that forgets who did something the
 * moment they leave is not an audit trail.
 */
export async function audit(
  actor: AdminUser,
  action: string,
  target?: string,
  detail?: Record<string, unknown>,
): Promise<void> {
  try {
    await requireAdminDb()
      .from("audit_log")
      .insert({
        admin_user_id: actor.id,
        actor_email: actor.email,
        action,
        target: target ?? null,
        detail: detail ?? {},
      });
  } catch (error) {
    console.error("[arkan] Could not write the audit log:", error);
  }
}

export async function signOut(): Promise<void> {
  try {
    await authClient().auth.signOut();
  } catch (error) {
    console.error("[arkan] Sign out failed:", error);
  }
}
