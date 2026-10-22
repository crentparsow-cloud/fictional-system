import type Stripe from "stripe";
import { applyPendingCredits, processFirstPayment, type PendingCredit, type RewardDeps } from "@/lib/referral-reward";

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
 *   charge.refunded  the share is reversed in proportion to the refund
 */

export interface GrowthDb {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
  subscription(stripeSubscriptionId: string): Promise<{ userId: string; customerId: string } | null>;
}

export interface GrowthContext {
  db: GrowthDb;
  reward: RewardDeps & { creditApplied(creditId: string, balanceTxnId: string): Promise<void> };
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

export async function growthAfterStripeEvent(event: Stripe.Event, ctx: GrowthContext): Promise<string[]> {
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
    return done;
  }

  if (event.type === "charge.refunded") {
    const charge = event.data.object;
    const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : (charge.payment_intent?.id ?? null);
    if (!pi || !(charge.amount_refunded > 0)) return done;
    const r = check("reverse_author_referral_share", await ctx.db.rpc("reverse_author_referral_share", { p_payment_intent: pi, p_refunded_minor: charge.amount_refunded, p_livemode: event.livemode }));
    if (r === "recorded") done.push("author_share_reversed");
    return done;
  }
  return done;
}
