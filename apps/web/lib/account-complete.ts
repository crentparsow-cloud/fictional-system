import type Stripe from "stripe";

/**
 * The account deletion job (F-025) as a function over its effects, so it can
 * be tested with fakes and no network. app/api/account/complete/route.ts
 * builds the real dependencies (service role client and Stripe) and calls it.
 *
 * Order matters:
 *   1. Every live membership of a reader whose deletion is due is cancelled
 *      in Stripe at once (no proration, no final invoice), then recorded as
 *      cancelled in public.subscriptions (migration 0009).
 *   2. Only if every cancel worked does complete_due_deletions() run. If one
 *      failed, nothing is deleted this run and the job tries again next
 *      time. The database guards this too: a deletion cannot be marked
 *      complete while the mirror still shows a live subscription.
 *   3. Each auth user is removed and stamped, as before.
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
}

export interface DeletionJobResult {
  /** "blocked" when a subscription could not be cancelled, so nothing was deleted. */
  status: "ok" | "blocked";
  subscriptions_cancelled: number;
  subscriptions_failed: number;
  processed: number;
  auth_removed: number;
  auth_failed: number;
}

export async function runDeletionJob(deps: DeletionJobDeps): Promise<DeletionJobResult> {
  const result: DeletionJobResult = {
    status: "ok",
    subscriptions_cancelled: 0,
    subscriptions_failed: 0,
    processed: 0,
    auth_removed: 0,
    auth_failed: 0,
  };

  const due = await deps.dueSubscriptions();
  for (const s of due) {
    try {
      await deps.cancelSubscription(s.stripe_subscription_id);
      await deps.markSubscriptionCancelled(s.stripe_subscription_id);
      result.subscriptions_cancelled += 1;
    } catch {
      result.subscriptions_failed += 1;
    }
  }
  if (result.subscriptions_failed > 0) {
    result.status = "blocked";
    return result;
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
