import type Stripe from "stripe";

/**
 * The webhook's hooks into the royalty ledger (F-100, migration 0021). The
 * webhook calls these after its own work; each is idempotent in SQL, so a
 * repeated Stripe delivery records nothing twice. An error throws, the
 * webhook answers 500 and Stripe retries.
 */
export interface LedgerRepo {
  /** A paid single purchase: receipt and sale line (app.record_sale_receipt). */
  recordSale(purchaseId: string, paymentIntentId: string | null, livemode: boolean): Promise<string>;
  /** A paid membership invoice: receipt for the pool (app.record_membership_receipt). */
  recordMembership(invoiceId: string, livemode: boolean): Promise<string>;
  /** Every refund Stripe holds for this payment, each recorded once (app.record_refund). */
  syncRefunds(paymentIntentId: string, livemode: boolean): Promise<void>;
  /** A dispute opened, or won (app.record_refund with kind dispute or dispute_reversal). */
  recordDispute(kind: "dispute" | "dispute_reversal", dispute: DisputeInfo, livemode: boolean): Promise<string>;
}

export interface DisputeInfo {
  id: string;
  paymentIntentId: string;
  amountMinor: number;
  currency: string;
  at: string;
}

/** What the ledger needs from a dispute event, or null when it cannot be used. */
export function disputeInfo(d: Pick<Stripe.Dispute, "id" | "amount" | "currency" | "payment_intent" | "created">): DisputeInfo | null {
  const pi = typeof d.payment_intent === "string" ? d.payment_intent : (d.payment_intent?.id ?? null);
  if (!pi || !(d.amount > 0)) return null;
  return { id: d.id, paymentIntentId: pi, amountMinor: d.amount, currency: d.currency.toUpperCase(), at: new Date(d.created * 1000).toISOString() };
}

/**
 * The fee Stripe took on a charge, in the charge's currency. The balance
 * transaction is in the settlement currency; when they differ the fee is
 * converted back with Stripe's exchange rate.
 */
export function feeFromBalanceTxn(
  txn: Pick<Stripe.BalanceTransaction, "id" | "fee" | "currency" | "exchange_rate"> | null | undefined,
  chargeCurrency: string,
): { feeMinor: number; balanceTxnId: string } | null {
  if (!txn || typeof txn.fee !== "number") return null;
  if (txn.currency.toUpperCase() === chargeCurrency.toUpperCase()) return { feeMinor: txn.fee, balanceTxnId: txn.id };
  if (!txn.exchange_rate || txn.exchange_rate <= 0) return null;
  return { feeMinor: Math.round(txn.fee / txn.exchange_rate), balanceTxnId: txn.id };
}
