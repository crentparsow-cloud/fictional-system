import { parseMajorToMinor } from "@/lib/money/format";

/**
 * Refunds from the staff console (F-102). Pure helpers: the form parser,
 * the Stripe reason, and how much of the author's share to reclaim from an
 * earlier payout.
 *
 * Policy (docs/legal/refund-policy.md): a single workbook is refunded at
 * staff discretion with a reason (goodwill window, question C6, is
 * Crent's); a full refund ends access; a membership is refunded pro rata
 * in the cooling-off window by the portal flow, and the console can refund
 * any amount up to what is left. The author's share is always reversed in
 * the ledger. If the author has already been paid, staff may reclaim it at
 * once with a transfer reversal; otherwise it comes off the next statement.
 */

export const REFUND_REASONS = {
  goodwill: "Goodwill",
  faulty: "Faulty or not as described",
  checkout_problem: "Charged without access",
  takedown: "Title withdrawn",
  demo_charged: "Demo item charged",
  duplicate: "Duplicate payment",
  fraud: "Suspected fraud",
  other: "Other",
} as const;
export type RefundReason = keyof typeof REFUND_REASONS;

export function isRefundReason(v: unknown): v is RefundReason {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(REFUND_REASONS, v);
}

/** Stripe's own reason field takes three values. */
export function stripeRefundReason(r: RefundReason): "duplicate" | "fraudulent" | "requested_by_customer" {
  if (r === "duplicate") return "duplicate";
  if (r === "fraud") return "fraudulent";
  return "requested_by_customer";
}

export interface RefundRequest {
  /** A single purchase (public.purchases) or a membership invoice (public.subscription_invoices). */
  target: "purchase" | "invoice";
  /** The row id of that purchase or invoice. */
  targetId: string;
  /** null: refund whatever is left. */
  amountMinor: number | null;
  reason: RefundReason;
  reclaim: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseRefundForm(get: (name: string) => unknown): RefundRequest | null {
  const target = get("target");
  const targetId = get("target_id");
  const reason = get("reason");
  const scope = get("scope");
  if (target !== "purchase" && target !== "invoice") return null;
  if (typeof targetId !== "string" || !UUID.test(targetId) || !isRefundReason(reason)) return null;
  let amountMinor: number | null = null;
  if (scope === "partial") {
    amountMinor = parseMajorToMinor(get("amount"));
    if (amountMinor === null) return null;
  } else if (scope !== "full") {
    return null;
  }
  return { target, targetId: targetId.toLowerCase(), amountMinor, reason, reclaim: target === "purchase" && get("reclaim") === "yes" };
}

/**
 * How much to reclaim from a paid transfer: the author's share this refund
 * reversed, but never more than the organisation now owes (a balance below
 * zero). While the balance is still positive the next statement absorbs it.
 */
export function reclaimAmount(reversedAuthorMinor: number, balanceAfterMinor: number): number {
  const reversed = Math.max(0, Math.trunc(reversedAuthorMinor));
  const owed = Math.max(0, -Math.trunc(balanceAfterMinor));
  return Math.min(reversed, owed);
}

/** What is left to refund on a payment, given its total and what has gone back. */
export function refundableMinor(amountMinor: number, refundedMinor: number): number {
  return Math.max(0, Math.trunc(amountMinor) - Math.max(0, Math.trunc(refundedMinor)));
}

/** A search box value: a purchase id, a payment intent, a checkout session id or a membership invoice id. */
export function classifyPurchaseQuery(
  raw: unknown,
): { column: "id" | "stripe_payment_intent_id" | "stripe_checkout_session_id" | "stripe_invoice_id"; value: string } | null {
  if (typeof raw !== "string") return null;
  const q = raw.trim();
  if (/^in_[A-Za-z0-9]{6,100}$/.test(q)) return { column: "stripe_invoice_id", value: q };
  if (UUID.test(q)) return { column: "id", value: q.toLowerCase() };
  if (/^pi_[A-Za-z0-9_]{6,100}$/.test(q)) return { column: "stripe_payment_intent_id", value: q };
  if (/^cs_(test|live)_[A-Za-z0-9_]{6,200}$/.test(q)) return { column: "stripe_checkout_session_id", value: q };
  return null;
}
