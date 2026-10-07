import type Stripe from "stripe";

/**
 * The cooling-off refund for a membership that ends early (F-097, F-025),
 * shared by the two places that end one: the webhook, when a member cancels
 * through the Stripe portal inside the window, and the account deletion job.
 * docs/legal/refund-policy.md section 2 is the rule this follows.
 *
 * When the window runs:
 *   * First period: 14 days from the membership starting (the
 *     subscription's start_date, which is when the first invoice was paid).
 *   * Renewal of a yearly plan: 14 days from that renewal's payment. This is
 *     the renewal cooling-off the DMCC Act subscription regime adds for
 *     contracts of a year or more.
 *   * Renewal of a monthly plan: no window, so no refund. Cancelling simply
 *     stops the next renewal.
 *
 * The amount: amount paid times unused whole days over days in the period,
 * rounded down to the penny.
 *
 * Once per invoice: before refunding, the payment's existing refunds are
 * read, and one already made for this invoice (metadata akana_refund_invoice)
 * means nothing more is refunded. The create call also carries an
 * idempotency key per invoice, so two runs racing within Stripe's 24 hours
 * still make one refund.
 */

export const COOLING_OFF_DAYS = 14;
const DAY_MS = 86_400_000;

export interface ProRataInput {
  /** What the invoice took, in minor units. */
  amountPaid: number;
  /** When the cooling-off window opened. */
  windowFrom: Date;
  /** When the reader asked to end the membership. Defaults to now. */
  requestedAt?: Date;
  periodStart: Date;
  periodEnd: Date;
  now: Date;
}

export type ProRata =
  | { due: true; amountMinor: number; unusedDays: number; periodDays: number }
  | { due: false; reason: "outside_cooling_off" | "nothing_unused" };

/** True when the request falls within 14 days of the window opening. */
export function inCoolingOff(windowFrom: Date, requestedAt: Date): boolean {
  const since = requestedAt.getTime() - windowFrom.getTime();
  return since >= 0 && since <= COOLING_OFF_DAYS * DAY_MS;
}

export function proRataRefund(i: ProRataInput): ProRata {
  if (!inCoolingOff(i.windowFrom, i.requestedAt ?? i.now)) return { due: false, reason: "outside_cooling_off" };
  const periodDays = Math.round((i.periodEnd.getTime() - i.periodStart.getTime()) / DAY_MS);
  if (!(i.amountPaid > 0) || periodDays <= 0) return { due: false, reason: "nothing_unused" };
  const unusedDays = Math.min(periodDays, Math.max(0, Math.floor((i.periodEnd.getTime() - i.now.getTime()) / DAY_MS)));
  const amountMinor = Math.floor((i.amountPaid * unusedDays) / periodDays);
  if (amountMinor <= 0) return { due: false, reason: "nothing_unused" };
  return { due: true, amountMinor, unusedDays, periodDays };
}

/** Where a refund stands, in the words the cancellation email uses. */
export type RefundState = "pending" | "succeeded" | "failed";

/** What a refund attempt did. Ids are never part of it. */
export type RefundOutcome =
  | { status: "refunded"; amountMinor: number; currency: string; refundState?: RefundState }
  | { status: "already_refunded"; amountMinor?: number; currency?: string; refundState?: RefundState }
  | { status: "not_due"; reason: "no_paid_invoice" | "outside_cooling_off" | "nothing_unused" | "no_payment" };

/** The slice of the Stripe client the refund uses, so a fake can stand in for it. */
export interface StripeRefundApi {
  subscriptions: Pick<Stripe["subscriptions"], "retrieve">;
  invoices: Pick<Stripe["invoices"], "list">;
  invoicePayments: Pick<Stripe["invoicePayments"], "list">;
  refunds: Pick<Stripe["refunds"], "create" | "list">;
}

export type RefundReason = "account_deletion" | "cooling_off_cancel";

const DAY_S = 86_400;

/** The plan's interval, from the subscription item, else from the length of the paid period. */
function isYearly(sub: Stripe.Subscription, period: { start: number; end: number }): boolean {
  const interval = sub.items?.data?.[0]?.price?.recurring?.interval;
  if (interval) return interval === "year";
  return period.end - period.start >= 300 * DAY_S;
}

/**
 * Refund the unused part of the latest paid membership invoice when the
 * cooling-off window covers it. Throws on a Stripe error.
 */
export async function refundCoolingOff(
  api: StripeRefundApi,
  subscriptionId: string,
  opts: { now: Date; requestedAt?: Date; reason: RefundReason; subscription?: Stripe.Subscription },
): Promise<RefundOutcome> {
  const sub = opts.subscription ?? (await api.subscriptions.retrieve(subscriptionId));
  const list = await api.invoices.list({ subscription: subscriptionId, status: "paid", limit: 1 });
  const invoice = list.data[0];
  const paidAt = invoice?.status_transitions?.paid_at;
  if (!invoice?.id || typeof paidAt !== "number") return { status: "not_due", reason: "no_paid_invoice" };

  // The subscription line's period is the paid-for period; the invoice's own
  // period_start and period_end describe the period before it.
  const line = invoice.lines?.data?.find((l) => l.period?.start && l.period?.end);
  const period = line?.period ?? { start: invoice.period_start, end: invoice.period_end };

  // First period: the window opens when the membership starts. Yearly
  // renewal: it opens at that renewal's payment (the DMCC renewal
  // cooling-off). Monthly renewal: no window.
  let windowFrom: number | null;
  if (invoice.billing_reason === "subscription_create") windowFrom = sub.start_date ?? paidAt;
  else if (isYearly(sub, period)) windowFrom = paidAt;
  else windowFrom = null;
  if (windowFrom === null) return { status: "not_due", reason: "outside_cooling_off" };

  const r = proRataRefund({
    amountPaid: invoice.amount_paid,
    windowFrom: new Date(windowFrom * 1000),
    requestedAt: opts.requestedAt,
    periodStart: new Date(period.start * 1000),
    periodEnd: new Date(period.end * 1000),
    now: opts.now,
  });
  if (!r.due) return { status: "not_due", reason: r.reason };

  const payments = await api.invoicePayments.list({ invoice: invoice.id, status: "paid", limit: 1 });
  const payment = payments.data[0]?.payment;
  const paymentIntent = refOf(payment?.payment_intent);
  const charge = refOf(payment?.charge);
  if (!paymentIntent && !charge) return { status: "not_due", reason: "no_payment" };
  const target = paymentIntent ? { payment_intent: paymentIntent } : { charge: charge! };

  // Once per invoice, whichever path got there first.
  const existing = await api.refunds.list({ ...target, limit: 100 });
  const earlier = existing.data.find((x) => x.metadata?.akana_refund_invoice === invoice.id && x.status !== "failed" && x.status !== "canceled");
  if (earlier) {
    // The amount and state go to the cancellation email when a retry gets here.
    return typeof earlier.amount === "number"
      ? { status: "already_refunded", amountMinor: earlier.amount, currency: (earlier.currency ?? invoice.currency).toUpperCase(), refundState: refundStateOf(earlier.status) }
      : { status: "already_refunded" };
  }

  const created = await api.refunds.create(
    {
      ...target,
      amount: r.amountMinor,
      reason: "requested_by_customer",
      metadata: { akana_reason: opts.reason, akana_refund_invoice: invoice.id, unused_days: String(r.unusedDays), period_days: String(r.periodDays) },
    },
    { idempotencyKey: `akana-cooling-off-refund-${invoice.id}` },
  );
  return { status: "refunded", amountMinor: r.amountMinor, currency: invoice.currency.toUpperCase(), refundState: refundStateOf(created?.status) };
}

/** Stripe's refund status as pending, succeeded or failed. */
export function refundStateOf(status: string | null | undefined): RefundState {
  if (status === "succeeded") return "succeeded";
  if (status === "failed" || status === "canceled") return "failed";
  return "pending";
}

export type CoolingOffCancelResult =
  | { status: "cancelled"; refund: RefundOutcome }
  | { status: "not_requested" | "outside_cooling_off" | "already_ended" };

export interface StripeCoolingOffApi extends StripeRefundApi {
  subscriptions: Pick<Stripe["subscriptions"], "retrieve" | "cancel">;
}

const ENDED = new Set(["canceled", "incomplete_expired"]);

/**
 * A member asked through the portal to cancel within 14 days of the
 * membership starting: end it now and refund the unused days. Reads the
 * subscription fresh, so a repeated or late webhook does nothing once it
 * has ended. Refunds first, then cancels: if the cancel fails the webhook
 * is retried, the refund is not repeated and the cancel is tried again.
 * Throws on a Stripe error.
 */
export async function cancelInCoolingOff(
  api: StripeCoolingOffApi,
  subscriptionId: string,
  opts: { now: Date; requestedAt: Date },
): Promise<CoolingOffCancelResult> {
  const sub = await api.subscriptions.retrieve(subscriptionId);
  if (ENDED.has(sub.status)) return { status: "already_ended" };
  if (!sub.cancel_at_period_end && !sub.cancel_at) return { status: "not_requested" };
  if (!inCoolingOff(new Date(sub.start_date * 1000), opts.requestedAt)) return { status: "outside_cooling_off" };

  const refund = await refundCoolingOff(api, subscriptionId, { now: opts.now, requestedAt: opts.requestedAt, reason: "cooling_off_cancel", subscription: sub });
  const ended = await api.subscriptions.cancel(subscriptionId, { invoice_now: false, prorate: false });
  if (!ENDED.has(ended.status)) throw new Error(`subscription still ${ended.status}`);
  return { status: "cancelled", refund };
}

/** A Stripe error's code or type, or "unknown". Never the message, which can carry ids. */
export function errorCode(err: unknown): string {
  const e = err as { code?: unknown; type?: unknown } | null;
  if (e && typeof e.code === "string" && /^[a-z0-9_]{1,64}$/.test(e.code)) return e.code;
  if (e && typeof e.type === "string" && /^[A-Za-z0-9_]{1,64}$/.test(e.type)) return e.type;
  return "unknown";
}

function refOf(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}
