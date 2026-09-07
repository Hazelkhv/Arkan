/**
 * Server-only barrel for the lead pipeline.
 *
 * `lib/leads.ts` reads the filesystem and `lib/supabase.ts` reads secrets, so
 * neither may be pulled into a Client Component bundle. Keeping the imports
 * behind one module makes that boundary obvious at a glance: anything that
 * imports from here is server code.
 */
export { saveLead, toLeadRow, type LeadRow, type SaveResult } from "@/lib/leads";
export { notifyNewLead } from "@/lib/notify";
