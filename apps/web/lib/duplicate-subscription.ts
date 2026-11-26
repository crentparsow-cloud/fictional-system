import type Stripe from "stripe";

/**
 * A second live membership for one reader (review M9, migration 0075).
 *
 * Two checkout sessions opened together can both be paid. The database keeps
 * one live subscription per reader and tenant, and the webhook closes the
 * other one here: it is cancelled in Stripe at once, with no final invoice,
 * and its latest paid invoice is refunded in full, because the reader paid
 * for a membership they already had.
 *
 * Safe to repeat and safe in any order. A subscription that has ended is not
 * cancelled again. The refund is made once per invoice: an earlier refund
 * that carries the invoice id is found first, and the create call carries an
 * idempotency key made from the invoice. A payment that arrives after the
 * cancel is refunded when its invoice.paid event calls this again; the
 * subscription carries DUPLICATE_MARK so the webhook knows to.
 *
 * Only the latest paid invoice is refunded. A duplicate that ran for more
 * than one period (one found by the 0075 clean-up) is flagged to staff by
 * the webhook's alert, and they decide on the earlier payments.
 *
 * Throws on a Stripe error, so the webhook answers 500 and Stripe retries.
 */

/** Written to the subscription's cancellation_details.comment in Stripe. */
export const DUPLICATE_MARK = "akana_duplicate_membership";

export interface DuplicateClosed {
  /** The subscription as Stripe has it after the cancel. */
  subscription: Stripe.Subscription;
  refund: "refunded" | "already_refunded" | "nothing_paid";
}

/** The slice of the Stripe client this uses, so a fake can stand in for it. */
export interface StripeDuplicateApi {
  subscriptions: Pick<Stripe["subscriptions"], "retrieve" | "cancel">;
  invoices: Pick<Stripe["invoices"], "list">;
  invoicePayments: Pick<Stripe["invoicePayments"], "list">;
  refunds: Pick<Stripe["refunds"], "create" | "list">;
}

const ENDED = new Set(["canceled", "incomplete_expired"]);

export async function closeDuplicateSubscription(api: StripeDuplicateApi, subscriptionId: string): Promise<DuplicateClosed> {
  let sub = await api.subscriptions.retrieve(subscriptionId);
  if (!ENDED.has(sub.status)) {
    sub = await api.subscriptions.cancel(subscriptionId, { invoice_now: false, prorate: false, cancellation_details: { comment: DUPLICATE_MARK } });
    if (!ENDED.has(sub.status)) throw new Error(`duplicate subscription still ${sub.status}`);
  }

  const list = await api.invoices.list({ subscription: subscriptionId, status: "paid", limit: 1 });
  const invoice = list.data[0];
  if (!invoice?.id || !(invoice.amount_paid > 0)) return { subscription: sub, refund: "nothing_paid" };

  const payments = await api.invoicePayments.list({ invoice: invoice.id, status: "paid", limit: 1 });
  const payment = payments.data[0]?.payment;
  const paymentIntent = refOf(payment?.payment_intent);
  const charge = refOf(payment?.charge);
  if (!paymentIntent && !charge) return { subscription: sub, refund: "nothing_paid" };
  const target = paymentIntent ? { payment_intent: paymentIntent } : { charge: charge! };

  const existing = await api.refunds.list({ ...target, limit: 100 });
  const live = existing.data.filter((r) => r.status !== "failed" && r.status !== "canceled");
  if (live.some((r) => r.metadata?.akana_refund_invoice === invoice.id && r.metadata?.akana_reason === "duplicate_membership")) {
    return { subscription: sub, refund: "already_refunded" };
  }
  const remaining = invoice.amount_paid - live.reduce((sum, r) => sum + (r.amount ?? 0), 0);
  if (remaining <= 0) return { subscription: sub, refund: "already_refunded" };

  await api.refunds.create(
    { ...target, amount: remaining, reason: "duplicate", metadata: { akana_reason: "duplicate_membership", akana_refund_invoice: invoice.id } },
    { idempotencyKey: `akana-duplicate-refund-${invoice.id}` },
  );
  return { subscription: sub, refund: "refunded" };
}

function refOf(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}
