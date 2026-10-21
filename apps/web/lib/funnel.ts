/**
 * First-party funnel counts (F-141, extended by 0036 for build list 10.4).
 *
 * What is counted: page_view, sample_view, free_week_started,
 * checkout_started, purchase, week_completed, and from 0036 field_answered,
 * step_finished, trial_started, trial_cancelled and membership_cancelled.
 * Each call adds one to a daily count for the tenant, for the workbook when
 * there is one, and for the unit when there is one
 * (public.record_funnel_event). No address, no answer and no free text is
 * ever sent, so an answer cannot reach the table. No third-party analytics,
 * pixels or replay.
 *
 * Identity. A call may carry a visitor hash so the same visitor is counted
 * once a day per event (the uniques column). The hash is
 * sha256(LEAD_HASH_SALT : UTC date : subject), the subject being the user id
 * when signed in and the address with the user agent otherwise
 * (lib/visitor-id.ts). It rotates daily, is never shown, and the rows that
 * hold it are deleted by the daily sweep. No cookie is set for it.
 *
 * Opt-out. Nothing is counted when the visitor has turned counting off on
 * /counting (the akana_no_count cookie), or their browser sends Global
 * Privacy Control (Sec-GPC: 1) or Do Not Track (DNT: 1).
 *
 * Counting is best effort. A failure is logged with its code and never
 * breaks the page or route that asked.
 */
import type { FunnelEvent } from "@/lib/admin/funnel";
import { visitorHashFor } from "@/lib/visitor-id";

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

export interface CountOptions {
  tenantId: string;
  workbookId?: string | null;
  /** The unit number, for field_answered and step_finished. 1 to 999. */
  unit?: number | null;
  headers: HeaderBag | null;
  cookies?: CookieBag;
  /**
   * The signed-in reader, so the daily hash is of their id and not of the
   * address. Only the hash leaves this process.
   */
  userId?: string | null;
}

/**
 * Count one event. Pass the request headers and cookies so the opt-out is
 * honoured; server-to-server events with no visitor (the Stripe webhook's
 * purchase) pass null and are always counted, because they carry no
 * personal data and the reader's browser is not involved.
 */
export async function countFunnelEvent(client: RpcClient, event: FunnelEvent, o: CountOptions): Promise<boolean> {
  if (o.headers && countingOptedOut(o.headers, o.cookies)) return false;
  try {
    const args: Record<string, unknown> = { p_event: event, p_tenant: o.tenantId, p_workbook: o.workbookId ?? null };
    if (o.unit != null && Number.isInteger(o.unit) && o.unit >= 1 && o.unit <= 999) args.p_unit = o.unit;
    // Without a salt in production the count still goes in, with no visitor.
    let visitor: string | null = null;
    try {
      visitor = visitorHashFor(o.headers, o.userId);
    } catch {
      console.error("funnel_visitor_hash_unavailable");
    }
    if (visitor) args.p_visitor = visitor;
    const { error } = await client.rpc("record_funnel_event", args);
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

/** The parts of a Stripe subscription event the membership counts need. */
export interface SubscriptionEventLike {
  type: string;
  data: {
    object: {
      status?: string | null;
      cancel_at_period_end?: boolean | null;
      cancel_at?: number | null;
      trial_end?: number | null;
    };
    previous_attributes?: {
      status?: string | null;
      cancel_at_period_end?: boolean | null;
      cancel_at?: number | null;
    } | null;
  };
}

/**
 * Which membership event a Stripe subscription webhook stands for, or null.
 *
 *   trial_started         customer.subscription.created with status trialing
 *   trial_cancelled       a cancel asked for while the subscription was trialing
 *   membership_cancelled  a cancel asked for on a paid membership
 *
 * A cancel is "asked for" when status turns canceled, cancel_at_period_end
 * turns true or cancel_at is set, each read against previous_attributes so
 * the same request is not counted on every later update. A deleted event on
 * a subscription that already carried a cancel request is the same cancel
 * arriving at its end date, so it is not counted again.
 */
export function membershipFunnelEvent(event: SubscriptionEventLike, now: Date = new Date()): FunnelEvent | null {
  const obj = event.data.object;
  const prev = event.data.previous_attributes ?? {};
  if (event.type === "customer.subscription.created") return obj.status === "trialing" ? "trial_started" : null;
  if (event.type !== "customer.subscription.updated" && event.type !== "customer.subscription.deleted") return null;

  const wasTrial = prev.status === "trialing" || obj.status === "trialing" || (obj.trial_end != null && obj.trial_end * 1000 > now.getTime());
  let requested = false;
  if (event.type === "customer.subscription.deleted") {
    requested = !obj.cancel_at_period_end && obj.cancel_at == null;
  } else {
    if (obj.status === "canceled" && prev.status != null && prev.status !== "canceled") requested = true;
    if (obj.cancel_at_period_end === true && prev.cancel_at_period_end === false) requested = true;
    if (obj.cancel_at != null && "cancel_at" in prev && prev.cancel_at == null) requested = true;
  }
  if (!requested) return null;
  return wasTrial ? "trial_cancelled" : "membership_cancelled";
}
