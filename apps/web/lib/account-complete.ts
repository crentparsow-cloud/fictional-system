import type Stripe from "stripe";
import { errorCode, refundCoolingOff, type RefundOutcome, type StripeRefundApi } from "@/lib/membership-refund";

export { COOLING_OFF_DAYS, errorCode, proRataRefund, type RefundOutcome } from "@/lib/membership-refund";

/**
 * The account deletion job (F-025) as a function over its effects, so it can
 * be tested with fakes and no network. app/api/account/complete/route.ts
 * builds the real dependencies (service role client and Stripe) and calls it.
 *
 * Order matters:
 *   1. Every live membership of a reader whose deletion is due is cancelled
 *      in Stripe at once (no proration, no final invoice), then recorded as
 *      cancelled in public.subscriptions (migration 0009).
 *      Straight after a cancel that worked, the cooling-off refund in
 *      lib/membership-refund.ts runs (shared with the webhook): within 14
 *      days of the membership starting, or of a yearly renewal's payment,
 *      the unused whole days are refunded pro rata, once per invoice.
 *      A refund error never fails the deletion once the cancel has worked:
 *      it is logged with a code and counted, and the run goes on.
 *   2. Only if every cancel worked does the run go on. If one failed,
 *      nothing is deleted or redacted this run and the job tries again next
 *      time. The database guards this too: a deletion cannot be marked
 *      complete while the mirror still shows a live subscription.
 *   3. Redact. Every Stripe customer linked to a reader whose deletion is
 *      due (public.due_deletion_customers(), migration 0010) has its name,
 *      email, phone, address and shipping cleared and its metadata emptied
 *      except akana_deleted=true, whether or not a membership was live.
 *      Invoices keep their own copy for the tax record. A failure is logged
 *      with a code and counted, and never blocks the deletion.
 *   4. complete_due_deletions() runs, then each auth user is removed and
 *      stamped, as before.
 *
 * Ids are never logged or returned, only counts.
 */

export interface DueSubscription {
  user_id: string;
  stripe_subscription_id: string;
}

export type CancelResult = "cancelled" | "already_ended";

export interface DeletionJobDeps {
  /** public.due_deletion_subscriptions() */
  dueSubscriptions(): Promise<DueSubscription[]>;
  /** Cancel in Stripe now. Throws when Stripe could not be reached or refused. */
  cancelSubscription(subscriptionId: string): Promise<CancelResult>;
  /** public.mark_subscription_cancelled() */
  markSubscriptionCancelled(subscriptionId: string): Promise<void>;
  /** public.complete_due_deletions(): the user ids whose auth user should go. */
  completeDueDeletions(): Promise<string[]>;
  /** auth.admin.deleteUser(). "gone" when it was already removed. */
  deleteAuthUser(userId: string): Promise<"removed" | "gone" | "failed">;
  /** public.mark_auth_removed() */
  markAuthRemoved(userId: string): Promise<boolean>;
  /** Refund the unused part of a membership just cancelled, when it is due. Throws on a Stripe error. */
  refundUnused?(subscriptionId: string): Promise<RefundOutcome>;
  /** public.due_deletion_customers(): every Stripe customer id linked to a reader whose deletion is due. */
  dueCustomers?(): Promise<string[]>;
  /** Clear a Stripe customer, keeping only a deleted flag. Throws on a Stripe error. */
  redactCustomer?(customerId: string): Promise<void>;
  /** A code and a short reason (a Stripe error code, never an id or an address). */
  log?(code: string, reason: string): void;
}

export interface DeletionJobResult {
  /** "blocked" when a subscription could not be cancelled, so nothing was deleted. */
  status: "ok" | "blocked";
  subscriptions_cancelled: number;
  subscriptions_failed: number;
  refunds_issued: number;
  refunds_failed: number;
  customers_redacted: number;
  redactions_failed: number;
  processed: number;
  auth_removed: number;
  auth_failed: number;
}

export async function runDeletionJob(deps: DeletionJobDeps): Promise<DeletionJobResult> {
  const result: DeletionJobResult = {
    status: "ok",
    subscriptions_cancelled: 0,
    subscriptions_failed: 0,
    refunds_issued: 0,
    refunds_failed: 0,
    customers_redacted: 0,
    redactions_failed: 0,
    processed: 0,
    auth_removed: 0,
    auth_failed: 0,
  };

  const due = await deps.dueSubscriptions();
  for (const s of due) {
    const id = s.stripe_subscription_id;
    let cancelled: CancelResult;
    try {
      cancelled = await deps.cancelSubscription(id);
    } catch {
      result.subscriptions_failed += 1;
      continue;
    }

    // The cancel worked. From here a Stripe error is logged and counted, never fatal.
    if (cancelled === "cancelled" && deps.refundUnused) {
      try {
        const refund = await deps.refundUnused(id);
        if (refund.status === "refunded") result.refunds_issued += 1;
      } catch (err) {
        result.refunds_failed += 1;
        deps.log?.("deletion_refund_failed", errorCode(err));
      }
    }
    try {
      await deps.markSubscriptionCancelled(id);
      result.subscriptions_cancelled += 1;
    } catch {
      result.subscriptions_failed += 1;
    }
  }
  if (result.subscriptions_failed > 0) {
    result.status = "blocked";
    return result;
  }

  // Redact every linked Stripe customer before the rows that link them go.
  if (deps.dueCustomers && deps.redactCustomer) {
    let customers: string[] = [];
    try {
      customers = [...new Set(await deps.dueCustomers())];
    } catch (err) {
      result.redactions_failed += 1;
      deps.log?.("deletion_redact_lookup_failed", errorCode(err));
    }
    for (const c of customers) {
      try {
        await deps.redactCustomer(c);
        result.customers_redacted += 1;
      } catch (err) {
        result.redactions_failed += 1;
        deps.log?.("deletion_redact_failed", errorCode(err));
      }
    }
  }

  const ids = await deps.completeDueDeletions();
  result.processed = ids.length;
  for (const id of ids) {
    const gone = await deps.deleteAuthUser(id);
    if (gone === "failed") {
      result.auth_failed += 1;
      continue;
    }
    if (await deps.markAuthRemoved(id)) result.auth_removed += 1;
    else result.auth_failed += 1;
  }
  return result;
}

/** The slice of the Stripe client the job uses, so a fake can stand in for it. */
export type StripeSubscriptionsApi = Pick<Stripe["subscriptions"], "cancel" | "retrieve">;

const ENDED = new Set(["canceled", "incomplete_expired"]);

/**
 * Cancel a subscription immediately. A subscription Stripe no longer has,
 * or one that has already ended, counts as done. Anything else throws so
 * the job blocks and retries.
 */
export function stripeCanceller(subscriptions: StripeSubscriptionsApi) {
  return async function cancel(subscriptionId: string): Promise<CancelResult> {
    let sub: Stripe.Subscription;
    try {
      sub = await subscriptions.cancel(subscriptionId, { invoice_now: false, prorate: false });
    } catch (err) {
      if (isMissing(err)) return "already_ended";
      let current: Stripe.Subscription;
      try {
        current = await subscriptions.retrieve(subscriptionId);
      } catch (e) {
        if (isMissing(e)) return "already_ended";
        throw err;
      }
      if (ENDED.has(current.status)) return "already_ended";
      throw err;
    }
    if (!ENDED.has(sub.status)) throw new Error(`subscription still ${sub.status}`);
    return "cancelled";
  };
}

function isMissing(err: unknown): boolean {
  const e = err as { code?: string; statusCode?: number } | null;
  return Boolean(e && (e.code === "resource_missing" || e.statusCode === 404));
}

// ---------------------------------------------------------------------------
// Refund and redaction over the Stripe client (F-025, F-097)
// ---------------------------------------------------------------------------

/** The slice of the Stripe client the refund and redaction steps use, so a fake can stand in for it. */
export interface StripeSettlementApi extends StripeRefundApi {
  customers: Pick<Stripe["customers"], "retrieve" | "update">;
}

/** The only metadata key left on a redacted customer. */
export const DELETED_FLAG = "akana_deleted";

/** Both steps throw on a Stripe error so the job can count it. */
export function stripeSettlement(api: StripeSettlementApi, now: () => Date = () => new Date()) {
  async function refundUnused(subscriptionId: string): Promise<RefundOutcome> {
    return refundCoolingOff(api, subscriptionId, { now: now(), reason: "account_deletion" });
  }

  async function redactCustomer(customerId: string): Promise<void> {
    const customer = await api.customers.retrieve(customerId);
    if ("deleted" in customer && customer.deleted) return;
    const metadata: Record<string, string> = {};
    for (const key of Object.keys(customer.metadata ?? {})) metadata[key] = "";
    metadata[DELETED_FLAG] = "true";
    await api.customers.update(customerId, { name: "", email: "", phone: "", address: "", shipping: "", metadata });
  }

  return { refundUnused, redactCustomer };
}
