/**
 * First-party funnel counts (F-141).
 *
 * What is counted: page_view, sample_view, free_week_started,
 * checkout_started, purchase and week_completed. Each call adds one to a
 * daily count for the tenant, and for the workbook when there is one
 * (public.record_funnel_event, migration 0016). No user id, session id,
 * address or free text is ever sent, so an answer cannot reach the table.
 * No third-party analytics, pixels or replay.
 *
 * Opt-out. Nothing is counted when the visitor has turned counting off on
 * /counting (the akana_no_count cookie), or their browser sends Global
 * Privacy Control (Sec-GPC: 1) or Do Not Track (DNT: 1).
 *
 * Counting is best effort. A failure is logged with its code and never
 * breaks the page or route that asked.
 */
import type { FunnelEvent } from "@/lib/admin/funnel";

export type { FunnelEvent } from "@/lib/admin/funnel";

export const OPT_OUT_COOKIE = "akana_no_count";

type HeaderBag = Pick<Headers, "get">;
type CookieBag = { get(name: string): { value: string } | undefined };

/** True when the visitor has asked not to be counted, in any of the three ways. */
export function countingOptedOut(headers: HeaderBag, cookies?: CookieBag): boolean {
  if (headers.get("sec-gpc")?.trim() === "1") return true;
  if (headers.get("dnt")?.trim() === "1") return true;
  return cookies?.get(OPT_OUT_COOKIE)?.value === "1";
}

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: { code?: string } | null }>;
};

/**
 * Count one event. Pass the request headers and cookies so the opt-out is
 * honoured; server-to-server events with no visitor (the Stripe webhook's
 * purchase) pass null and are always counted, because they carry no
 * personal data and the reader's browser is not involved.
 */
export async function countFunnelEvent(
  client: RpcClient,
  event: FunnelEvent,
  o: { tenantId: string; workbookId?: string | null; headers: HeaderBag | null; cookies?: CookieBag },
): Promise<boolean> {
  if (o.headers && countingOptedOut(o.headers, o.cookies)) return false;
  try {
    const { error } = await client.rpc("record_funnel_event", {
      p_event: event,
      p_tenant: o.tenantId,
      p_workbook: o.workbookId ?? null,
    });
    if (error) {
      console.error("funnel_count_failed", event, error.code ?? "");
      return false;
    }
    return true;
  } catch {
    console.error("funnel_count_failed", event, "exception");
    return false;
  }
}
