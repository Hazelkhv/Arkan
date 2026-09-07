import { promises as fs } from "node:fs";
import path from "node:path";
import { getSupabase } from "@/lib/supabase";
import type { ConsultationInput } from "@/lib/validation";

/**
 * Where a consultation request goes once it has been validated.
 *
 * Primary store is the Supabase `leads` table (see supabase/schema.sql). When
 * Supabase is not configured the request still has to survive — losing a lead
 * because an environment variable is missing is the one failure this site
 * cannot afford — so it falls through to a local file in development and to a
 * structured server log otherwise. Both paths are loud about being temporary.
 */

const TABLE = "leads";
const FALLBACK_DIR = path.join(process.cwd(), ".data");
const FALLBACK_FILE = path.join(FALLBACK_DIR, "leads.json");

export type LeadRow = {
  full_name: string;
  phone: string;
  email: string | null;
  business_name: string;
  industry: string | null;
  stage: string;
  challenge: string;
  preferred_time: string | null;
};

export type SaveResult =
  | { ok: true; storage: "supabase" | "fallback" }
  | { ok: false };

/** Maps the form's camelCase fields onto the table's snake_case columns. */
export function toLeadRow(input: ConsultationInput): LeadRow {
  const blankToNull = (value?: string) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  };

  return {
    full_name: input.fullName.trim(),
    phone: input.phone.trim(),
    email: blankToNull(input.email),
    business_name: input.businessName.trim(),
    industry: blankToNull(input.industry),
    stage: input.stage,
    challenge: input.challenge.trim(),
    preferred_time: blankToNull(input.preferredTime),
  };
}

export async function saveLead(row: LeadRow): Promise<SaveResult> {
  const supabase = getSupabase();

  if (supabase) {
    const { error } = await supabase.from(TABLE).insert(row);

    if (!error) return { ok: true, storage: "supabase" };

    console.error("[arkan] Supabase insert failed:", error.message);
    return { ok: false };
  }

  return saveToFallback(row);
}

/**
 * Temporary store, used only while Supabase is unconfigured.
 *
 * Serverless filesystems are read-only outside /tmp, so a failed write is
 * expected in production rather than exceptional; the structured log below is
 * the real safety net there and is deliberately easy to grep for.
 */
async function saveToFallback(row: LeadRow): Promise<SaveResult> {
  const record = { ...row, created_at: new Date().toISOString(), status: "new" };

  console.warn(
    "[arkan] Supabase is not configured — storing this lead outside the database.",
  );
  console.info("[arkan] lead:", JSON.stringify(record));

  try {
    await fs.mkdir(FALLBACK_DIR, { recursive: true });

    const existing = await fs
      .readFile(FALLBACK_FILE, "utf8")
      .then((contents) => JSON.parse(contents) as unknown[])
      .catch(() => []);

    await fs.writeFile(
      FALLBACK_FILE,
      JSON.stringify([...existing, record], null, 2),
      "utf8",
    );
  } catch {
    // Read-only filesystem. The log above is the record of this lead.
  }

  return { ok: true, storage: "fallback" };
}
