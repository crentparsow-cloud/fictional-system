import type Stripe from "stripe";
import { applyPendingCredits, processFirstPayment, reverseReferralReward, type PendingCredit, type ReversalDeps, type RewardDeps } from "@/lib/referral-reward";
import { countEventServer } from "@/lib/funnel";
import { MARKETPLACE_TENANT_ID } from "@/lib/tenant";
import { inCoolingOff } from "@/lib/membership-refund";

/**
 * What the growth features do when Stripe tells us about money (6.3, 13.11,
 * 14.13). Called by the webhook route after the membership and ledger work
 * for the event is done, so the receipt exists before the author share is
 * worked out. Everything here is idempotent: the database functions key on
 * the invoice or the referral, and the Stripe calls carry idempotency keys.
 * A thrown error makes the webhook answer 500 and Stripe retries.
 *
 *   invoice.paid     the author's share of a referred member's payment (a
 *                    ledger line, 12 months from their first payment), credit
 *                    still waiting for a customer, and the reader referral
 *                    reward when this is the friend's first payment of money
 *   charge.refunded  the share is reversed in proportion to the refund. The
 *                    referral reward goes back (0068) when the friend's first
 *                    payment is refunded in full, or in any part within 14
 *                    days of being taken: a cooling-off cancel refunds pro
 *                    rata, so waiting for a full refund left the reward with
 *                    the referrer (M8)
 *   customer.subscription.updated, when the webhook ended the membership in
 *                    cooling-off: the reward on the friend's first payment
 *                    goes back even if no refund event follows
 *   charge.dispute.created  a dispute on that first payment takes it back too
 *
 * The reward reversal is safe to ask for more than once: the database hands
 * the reward back until the reversal is recorded and nothing after that, and
 * the Stripe write is keyed on the referral.
 */

/** What the main handler did with the event, for the cases that depend on it. */
export interface GrowthHints {
  action?: string;
  subscriptionId?: string | null;
}

export interface GrowthDb {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
  subscription(stripeSubscriptionId: string): Promise<{ userId: string; customerId: string } | null>;
}

export interface GrowthContext {
  db: GrowthDb;
  reward: RewardDeps & { creditApplied(creditId: string, balanceTxnId: string): Promise<void> };
  reversal: ReversalDeps;
}

function check(name: string, r: { data: unknown; error: { code?: string; message?: string } | null }): unknown {
  if (r.error) throw new Error(`${name} failed: ${r.error.code ?? r.error.message ?? "unknown"}`);
  return r.data;
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const ref = invoice.parent?.subscription_details?.subscription as string | { id: string } | null | undefined;
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

export async function growthAfterStripeEvent(event: Stripe.Event, ctx: GrowthContext, hints: GrowthHints = {}): Promise<string[]> {
  const done: string[] = [];
  if (event.type === "invoice.paid") {
    const invoice = event.data.object;
    const subscriptionId = invoiceSubscriptionId(invoice);
    if (!invoice.id || !subscriptionId) return done;
    const sub = await ctx.db.subscription(subscriptionId);
    if (!sub) return done;
    const paid = invoice.amount_paid ?? 0;

    if (paid > 0) {
      const share = check("record_author_referral_share", await ctx.db.rpc("record_author_referral_share", { p_invoice: invoice.id, p_livemode: event.livemode }));
      if (share === "recorded") done.push("author_share");
    }

    const pending = (check("credits_pending", await ctx.db.rpc("credits_pending", { p_user: sub.userId })) as { id: string; amount_minor: number; currency: string }[] | null) ?? [];
    if (pending.length > 0) {
      const credits: PendingCredit[] = pending.map((c) => ({ id: c.id, amountMinor: c.amount_minor, currency: c.currency }));
      if ((await applyPendingCredits(sub.customerId, credits, ctx.reward)) > 0) done.push("credit_applied");
    }

    const outcome = await processFirstPayment({ invoiceId: invoice.id, friendId: sub.userId, amountPaidMinor: paid, currency: invoice.currency ?? "gbp" }, ctx.reward);
    if (outcome !== "no_payment" && outcome !== "no_referral") done.push(`referral_${outcome}`);
    if (outcome === "credit_given" || outcome === "credit_waiting" || outcome === "trial_extended") await countEventServer(ctx.db, "referral_rewarded", { tenantId: MARKETPLACE_TENANT_ID });
    return done;
  }

  if (event.type === "charge.refunded") {
    const charge = event.data.object;
    const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : (charge.payment_intent?.id ?? null);
    if (!pi || !(charge.amount_refunded > 0)) return done;
    const r = check("reverse_author_referral_share", await ctx.db.rpc("reverse_author_referral_share", { p_payment_intent: pi, p_refunded_minor: charge.amount_refunded, p_livemode: event.livemode }));
    if (r === "recorded") done.push("author_share_reversed");
    // If this was a friend's first payment, the reward goes back on a full refund, and on any
    // refund made within the cooling-off period (the pro rata refund of a cooling-off cancel).
    const inWindow = typeof charge.created === "number" && inCoolingOff(new Date(charge.created * 1000), new Date(event.created * 1000));
    if (charge.refunded || inWindow) {
      const back = await reverseReferralReward(pi, "refunded", ctx.reversal);
      if (back !== "nothing_to_reverse") done.push(`referral_${back}`);
    }
    return done;
  }

  if (event.type === "customer.subscription.updated" && hints.action === "cooling_off_cancelled") {
    const subscriptionId = hints.subscriptionId ?? event.data.object.id;
    const sub = subscriptionId ? await ctx.db.subscription(subscriptionId) : null;
    if (!sub) return done;
    const found = await ctx.db.rpc("referral_first_payment_intent", { p_friend: sub.userId });
    // Until 0075 is applied the function is not there. The refund event that follows still takes the reward back.
    if (found.error?.code === "PGRST202") return done;
    const pi = check("referral_first_payment_intent", found);
    if (typeof pi !== "string" || !pi) return done;
    const back = await reverseReferralReward(pi, "refunded", ctx.reversal);
    if (back !== "nothing_to_reverse") done.push(`referral_${back}`);
    return done;
  }

  if (event.type === "charge.dispute.created") {
    const dispute = event.data.object;
    const pi = typeof dispute.payment_intent === "string" ? dispute.payment_intent : (dispute.payment_intent?.id ?? null);
    if (!pi) return done;
    const back = await reverseReferralReward(pi, "disputed", ctx.reversal);
    if (back !== "nothing_to_reverse") done.push(`referral_${back}`);
    return done;
  }
  return done;
}
