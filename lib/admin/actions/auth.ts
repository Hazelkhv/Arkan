"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireAdminDb } from "@/lib/ai/admin-client";
import { authClient, signOut } from "@/lib/admin/auth";

/**
 * Signing in.
 *
 * A magic link, not a password: there are no passwords to leak, to reuse, or to
 * rotate when somebody leaves. Supabase Auth sends the email; this decides who
 * is worth sending one to.
 *
 * That check matters more than it looks. Supabase will happily send a link to
 * any address and create an auth user for it, so without it the panel's login
 * form would be a way to make Arkan's domain send mail to strangers. Refusing
 * unknown addresses before the send is what stops that — and the answer shown
 * to the visitor is the same either way, so the form cannot be used to find out
 * who works here.
 */

export type LoginState = { message?: string; sent?: boolean };

export async function requestLoginLink(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { message: "Enter the email address your account uses." };
  }

  const sent = {
    sent: true,
    message: "If that address has access, a sign-in link is on its way.",
  };

  if (!(await isKnownAddress(email))) return sent;

  const origin = await siteOrigin();

  const { error } = await authClient().auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/admin/auth/callback`,
      // The panel is invitation-only. A link must never be the thing that
      // creates the account it signs in to.
      shouldCreateUser: true,
    },
  });

  if (error) {
    console.error("[arkan] Could not send a sign-in link:", error.message);
    return { message: "The sign-in email could not be sent. Try again shortly." };
  }

  return sent;
}

/**
 * True for an address that already has a panel account — or for the bootstrap
 * address, and only while the panel has no accounts at all.
 */
async function isKnownAddress(email: string): Promise<boolean> {
  const db = requireAdminDb();

  const { data } = await db
    .from("admin_users")
    .select("id")
    .eq("email", email)
    .eq("is_active", true)
    .maybeSingle();

  if (data) return true;

  const bootstrap = (process.env.ADMIN_BOOTSTRAP_EMAIL || "").trim().toLowerCase();
  if (!bootstrap || bootstrap !== email) return false;

  const { count } = await db
    .from("admin_users")
    .select("id", { count: "exact", head: true });

  return (count ?? 0) === 0;
}

async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || "";
  if (configured) return configured.replace(/\/+$/, "");

  // Falls back to the host the request arrived on, so a preview deployment
  // sends links back to itself rather than to production.
  const list = await headers();
  const host = list.get("x-forwarded-host") || list.get("host") || "localhost:3000";
  const protocol = list.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");

  return `${protocol}://${host}`;
}

export async function signOutAction(): Promise<void> {
  await signOut();
  redirect("/admin/login");
}
