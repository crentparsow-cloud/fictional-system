import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { proofMinFrom, proofTtlHoursFrom, siteProofLine, workbookProofLine, type ProofRow } from "@/lib/social-proof";

/**
 * The social proof lines, read from the table the daily job fills. Read with
 * the service role inside a cache that lasts an hour, so a busy page does not
 * query on every view and no reader's row is touched: the table holds counts
 * only. If anything fails the answer is no line, quietly.
 */
const load = unstable_cache(
  async (tenantId: string) => {
    try {
      const admin = createAdminClient();
      const [{ data: rows }, { data: cfg }] = await Promise.all([
        admin.from("social_proof_counts").select("scope, workbook_id, readers, computed_at").eq("tenant_id", tenantId).limit(1000),
        admin.from("app_config").select("key, value").in("key", ["social_proof_min", "social_proof_ttl_hours"]),
      ]);
      const config = (cfg ?? []) as { key: string; value: unknown }[];
      return { rows: (rows ?? []) as ProofRow[], min: proofMinFrom(config), ttlHours: proofTtlHoursFrom(config) };
    } catch {
      return { rows: [] as ProofRow[], min: 100, ttlHours: 26 };
    }
  },
  ["social-proof"],
  { revalidate: 3600 },
);

export async function workbookProof(tenantId: string, workbookId: string): Promise<string | null> {
  const d = await load(tenantId);
  return workbookProofLine(d.rows, workbookId, { now: new Date(), min: d.min, ttlHours: d.ttlHours });
}

export async function siteProof(tenantId: string): Promise<string | null> {
  const d = await load(tenantId);
  return siteProofLine(d.rows, { now: new Date(), min: d.min, ttlHours: d.ttlHours });
}
