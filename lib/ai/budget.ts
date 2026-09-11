import { getAdminDb } from "@/lib/ai/admin-client";
import { isUsableForChat, type CatalogModel } from "@/lib/ai/catalog";

/**
 * The spend cap.
 *
 * An operator sets monthly_budget_usd to stop a runaway bill, not to take the
 * assistant offline — so going over it downgrades the model rather than
 * refusing to answer. A visitor asking about a stalled business is the one
 * thing this site exists for; turning them away to save a fraction of a cent
 * would be the wrong trade in every direction.
 *
 * The downgrade is loud in the logs and visible on the dashboard, which is what
 * makes it a brake rather than a silent failure.
 */

const CACHE_TTL_MS = 60_000;

let cache: { at: number; month: string; spent: number } | null = null;

export async function monthToDateSpend(): Promise<number> {
  const month = new Date().toISOString().slice(0, 7);

  if (cache && cache.month === month && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.spent;
  }

  const db = getAdminDb();
  if (!db) return 0;

  const since = `${month}-01T00:00:00.000Z`;

  const { data, error } = await db
    .from("messages")
    .select("cost_usd")
    .gte("created_at", since)
    .not("cost_usd", "is", null);

  if (error) {
    console.error("[arkan] Could not total this month's spend:", error.message);
    return cache?.spent ?? 0;
  }

  const spent = ((data ?? []) as { cost_usd: number | string }[]).reduce(
    (total, row) => total + Number(row.cost_usd || 0),
    0,
  );

  cache = { at: Date.now(), month, spent };
  return spent;
}

/** The cheapest model that can still run a turn, used once the cap is passed. */
export function cheapestUsableModel(catalog: CatalogModel[]): CatalogModel | null {
  return (
    catalog
      .filter(isUsableForChat)
      .filter((model) => model.contextLength >= 32_000)
      .sort(
        (a, b) =>
          a.promptPrice + a.completionPrice - (b.promptPrice + b.completionPrice),
      )[0] ?? null
  );
}
