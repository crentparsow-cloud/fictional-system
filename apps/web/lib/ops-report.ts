import type { OpsKind } from "@/lib/admin/ops";

/**
 * reportOps (lib/ops-alerts.ts) for code that has no service role client to
 * hand: server actions, pages and mailer logs. record_ops_event is open to
 * the service role only (0016), so this loads the admin client lazily. It
 * never throws: a failure to report is logged and swallowed.
 */
export type OpsReporter = (kind: OpsKind, source: string, code: string | null) => Promise<void>;

export const reportOpsServer: OpsReporter = async (kind, source, code) => {
  try {
    const [{ createAdminClient }, { reportOps }] = await Promise.all([import("@/lib/supabase/admin"), import("@/lib/ops-alerts")]);
    await reportOps(createAdminClient(), kind, source, code);
  } catch (e) {
    console.error("ops_report_unavailable", kind, e instanceof Error ? e.name : "unknown");
  }
};
