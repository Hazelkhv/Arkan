import { requireAdminDb } from "@/lib/ai/admin-client";
import { audit, requireAdmin } from "@/lib/admin/auth";

/**
 * The lead list as a CSV.
 *
 * Two details that look pedantic and are not:
 *
 *   1. A field beginning with =, +, - or @ is prefixed with an apostrophe.
 *      Excel and Sheets treat those as formulas, and a "business name" of
 *      =HYPERLINK(...) is a real attack against whoever opens the file — every
 *      value in this export was typed by a member of the public.
 *   2. The file starts with a UTF-8 byte order mark. Without it Excel on
 *      Windows reads the file as the system codepage and mangles every accented
 *      character in a name.
 *
 * `requireAdmin` runs first: this endpoint hands over every contact detail the
 * firm holds, and it is a plain GET that a browser will follow.
 */

export const dynamic = "force-dynamic";

const COLUMNS = [
  ["created_at", "Received"],
  ["source", "Source"],
  ["status", "Status"],
  ["full_name", "Name"],
  ["phone", "Phone"],
  ["email", "Email"],
  ["business_name", "Business"],
  ["industry", "Industry"],
  ["stage", "Stage"],
  ["preferred_time", "Preferred time"],
  ["challenge", "Challenge"],
  ["notes", "Notes"],
  ["conversation_id", "Conversation"],
] as const;

export async function GET(request: Request): Promise<Response> {
  const admin = await requireAdmin("operate");

  const url = new URL(request.url);
  const source = url.searchParams.get("source");
  const status = url.searchParams.get("status");

  let query = requireAdminDb()
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5000);

  if (source) query = query.eq("source", source);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;

  if (error) {
    return new Response(`Could not read the leads: ${error.message}`, { status: 500 });
  }

  const rows = (data ?? []) as Record<string, unknown>[];

  const csv = [
    COLUMNS.map(([, label]) => escape(label)).join(","),
    ...rows.map((row) => COLUMNS.map(([key]) => escape(row[key])).join(",")),
  ].join("\r\n");

  await audit(admin, "lead.export", `${rows.length} rows`, { source, status });

  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(`﻿${csv}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="arkan-leads-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}

function escape(value: unknown): string {
  if (value === null || value === undefined) return "";

  let text = String(value);

  // Formula injection: a spreadsheet evaluates a cell starting with any of
  // these, and every value here was typed by a stranger.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;

  return `"${text.replace(/"/g, '""')}"`;
}
