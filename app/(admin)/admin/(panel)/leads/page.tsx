import type { Metadata } from "next";
import Link from "next/link";
import { LeadRow } from "@/components/admin/LeadRow";
import {
  Badge,
  Card,
  Empty,
  PageHeader,
  StatTile,
  inputClass,
  secondaryButtonClass,
} from "@/components/admin/ui";
import { requireAdminDb } from "@/lib/ai/admin-client";
import { requireAdmin } from "@/lib/admin/auth";
import { LEAD_STATUSES, LEAD_STATUS_LABELS } from "@/lib/admin/lead-status";
import { channelLabel } from "@/lib/admin/labels";

/**
 * Leads, from the website form and from the assistant, in one list.
 *
 * Contact details are the most sensitive thing this panel holds, which is why
 * the `leads` table has an insert-only policy for anon and nothing else: even
 * with the publishable key in hand, a visitor cannot read a single row back
 * out. This page reaches them through the service role, behind a sign-in.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Leads" };

type Row = {
  id: string;
  created_at: string;
  full_name: string;
  phone: string;
  email: string | null;
  business_name: string;
  industry: string | null;
  stage: string;
  challenge: string;
  preferred_time: string | null;
  status: string;
  source: string;
  conversation_id: string | null;
  notes: string | null;
};

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireAdmin("operate");

  const params = await searchParams;
  const source = typeof params.source === "string" ? params.source : "";
  const status = typeof params.status === "string" ? params.status : "";

  const db = requireAdminDb();

  let query = db
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);

  if (source) query = query.eq("source", source);
  if (status) query = query.eq("status", status);

  const [{ data }, { count: total }, { count: fromAssistant }, { count: fresh }] =
    await Promise.all([
      query,
      db.from("leads").select("id", { count: "exact", head: true }),
      db.from("leads").select("id", { count: "exact", head: true }).neq("source", "website"),
      db.from("leads").select("id", { count: "exact", head: true }).eq("status", "new"),
    ]);

  const rows = (data ?? []) as Row[];

  const exportHref = `/admin/leads/export${source || status ? `?${new URLSearchParams({ ...(source ? { source } : {}), ...(status ? { status } : {}) })}` : ""}`;

  return (
    <>
      <PageHeader
        title="Leads"
        description="Consultation requests, whichever surface produced them."
        actions={
          <Link href={exportHref} className={`${secondaryButtonClass} text-caption`}>
            Export as CSV
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Total" value={String(total ?? 0)} />
        <StatTile
          label="From the assistant"
          value={String(fromAssistant ?? 0)}
          hint="The rest came from the website form"
        />
        <StatTile label="Not yet contacted" value={String(fresh ?? 0)} />
      </div>

      <Card>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="source" className="mb-1.5 block text-caption font-semibold text-ink">
              Source
            </label>
            <select id="source" name="source" defaultValue={source} className={inputClass}>
              <option value="">All</option>
              <option value="website">Website form</option>
              <option value="web">Full-page chat</option>
              <option value="widget">Widget</option>
              <option value="telegram">Telegram</option>
            </select>
          </div>

          <div>
            <label htmlFor="status" className="mb-1.5 block text-caption font-semibold text-ink">
              Status
            </label>
            <select id="status" name="status" defaultValue={status} className={inputClass}>
              <option value="">All</option>
              {LEAD_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {LEAD_STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="inline-flex min-h-11 items-center rounded-btn bg-pine px-5 text-[0.9375rem] font-semibold text-bone hover:bg-[#0f2c26]"
          >
            Filter
          </button>
        </form>
      </Card>

      {rows.length === 0 ? (
        <Card>
          <Empty>No lead matches that.</Empty>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((row) => (
            <Card key={row.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-h3 text-pine">{row.business_name}</h2>
                  <p className="text-caption text-slate">
                    {row.full_name} · {row.phone}
                    {row.email && ` · ${row.email}`}
                  </p>
                  <p className="mt-1 text-caption text-slate">
                    {row.stage}
                    {row.industry && ` · ${row.industry}`}
                    {row.preferred_time && ` · prefers ${row.preferred_time}`}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={row.source === "website" ? "neutral" : "good"}>
                    {row.source === "website" ? "Website form" : channelLabel(row.source)}
                  </Badge>
                  {row.conversation_id && (
                    <Link
                      href={`/admin/inbox/${row.conversation_id}`}
                      className="text-caption font-medium text-pine underline underline-offset-4"
                    >
                      The conversation
                    </Link>
                  )}
                </div>
              </div>

              <p className="mt-3 whitespace-pre-wrap rounded-card bg-bone/70 p-3 text-caption text-ink">
                {row.challenge}
              </p>

              <LeadRow
                id={row.id}
                status={row.status}
                notes={row.notes}
                createdAt={row.created_at}
              />
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
