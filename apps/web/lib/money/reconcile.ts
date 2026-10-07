/**
 * Daily reconciliation of the ledger's receipts against Stripe balance
 * transactions (F-100). Pure: the route lists the balance transactions and
 * the receipts and hands both here; this says what matched, what is
 * missing on either side, which amounts disagree, and which Stripe fees the
 * ledger should learn.
 *
 * Matching:
 *   charge or payment         receipt kind sale or membership with the same
 *                             payment intent, or the same balance txn id
 *   refund or payment_refund  receipt kind refund with the refund id
 *   adjustment (a dispute)    receipt kind dispute or dispute_reversal with
 *                             the dispute id
 *   anything else             (transfers, payouts, Stripe's own fees) is not
 *                             receipt money and is left out
 *
 * Balance transactions are in the settlement currency. When that differs
 * from the payment currency, the amount is not compared and the fee is
 * converted back with Stripe's exchange rate, rounded to the minor unit.
 */

export interface StripeTxn {
  id: string;
  type: string;
  /** Signed, settlement currency, minor units. */
  amount: number;
  fee: number;
  currency: string;
  /** Seconds. */
  created: number;
  exchangeRate: number | null;
  /** The charge's payment intent, for charges and payments. */
  paymentIntentId: string | null;
  /** The source object's id: ch_, re_, du_, dp_ and so on. */
  sourceId: string | null;
}

export interface ReceiptRow {
  id: string;
  kind: string;
  stripe_ref: string;
  payment_intent_id: string | null;
  balance_txn_id: string | null;
  currency: string;
  gross_minor: number;
  /** null when no fee is known yet. */
  fee_minor: number | null;
  occurred_at: string;
}

export type ItemKind = "missing_in_ledger" | "missing_in_stripe" | "amount_mismatch" | "fee_mismatch" | "fee_corrected" | "currency_mismatch" | "unmatched_type";

export interface ReconItem {
  kind: ItemKind;
  stripe_ref: string | null;
  balance_txn_id: string | null;
  receipt_id: string | null;
  currency: string | null;
  expected_minor: number | null;
  actual_minor: number | null;
  note: string | null;
}

export interface FeeCorrection {
  receiptId: string;
  feeMinor: number;
  balanceTxnId: string;
  knownFeeMinor: number | null;
}

export interface ReconResult {
  stripeTxns: number;
  matched: number;
  items: ReconItem[];
  corrections: FeeCorrection[];
}

const MONEY_IN = new Set(["charge", "payment"]);
const MONEY_BACK = new Set(["refund", "payment_refund"]);
const DISPUTE = new Set(["adjustment", "payment_failure_refund"]);

export function isReceiptTxn(type: string): boolean {
  return MONEY_IN.has(type) || MONEY_BACK.has(type) || DISPUTE.has(type);
}

/**
 * window: only Stripe transactions created inside it can be missing from the
 * ledger, and only receipts that happened inside it can be missing from
 * Stripe. Pass transactions and receipts from a little either side so edge
 * cases still match.
 */
export function reconcile(txns: StripeTxn[], receipts: ReceiptRow[], window: { from: Date; to: Date }): ReconResult {
  const fromS = window.from.getTime() / 1000;
  const toS = window.to.getTime() / 1000;
  const inWindow = (t: StripeTxn) => t.created >= fromS && t.created < toS;

  const byPi = new Map<string, ReceiptRow>();
  const byTxn = new Map<string, ReceiptRow>();
  const byRef = new Map<string, ReceiptRow>();
  for (const r of receipts) {
    if ((r.kind === "sale" || r.kind === "membership") && r.payment_intent_id && !byPi.has(r.payment_intent_id)) byPi.set(r.payment_intent_id, r);
    if (r.balance_txn_id) byTxn.set(r.balance_txn_id, r);
    byRef.set(`${r.kind}:${r.stripe_ref}`, r);
  }

  const seen = new Set<string>();
  const items: ReconItem[] = [];
  const corrections: FeeCorrection[] = [];
  let considered = 0;
  let matched = 0;

  for (const t of txns) {
    if (!isReceiptTxn(t.type)) continue;
    let r: ReceiptRow | undefined;
    if (MONEY_IN.has(t.type)) {
      r = byTxn.get(t.id) ?? (t.paymentIntentId ? byPi.get(t.paymentIntentId) : undefined);
    } else if (MONEY_BACK.has(t.type)) {
      r = t.sourceId ? byRef.get(`refund:${t.sourceId}`) : undefined;
    } else {
      r = t.sourceId ? (byRef.get(`dispute:${t.sourceId}`) ?? byRef.get(`dispute_reversal:${t.sourceId}`)) : undefined;
    }
    const counts = inWindow(t);
    if (counts) considered++;
    if (!r) {
      if (counts) {
        items.push({
          kind: "missing_in_ledger",
          stripe_ref: t.paymentIntentId ?? t.sourceId,
          balance_txn_id: t.id,
          receipt_id: null,
          currency: t.currency.toUpperCase(),
          expected_minor: null,
          actual_minor: t.amount,
          note: `Stripe ${t.type} with no receipt in the ledger`,
        });
      }
      continue;
    }
    seen.add(r.id);
    if (counts) matched++;

    const sameCurrency = r.currency.toUpperCase() === t.currency.toUpperCase();
    if (sameCurrency && r.gross_minor !== t.amount) {
      items.push({
        kind: "amount_mismatch",
        stripe_ref: r.stripe_ref,
        balance_txn_id: t.id,
        receipt_id: r.id,
        currency: r.currency,
        expected_minor: r.gross_minor,
        actual_minor: t.amount,
        note: `Ledger and Stripe disagree on the ${t.type} amount`,
      });
    }
    if (MONEY_IN.has(t.type) && (r.kind === "sale" || r.kind === "membership")) {
      let fee = t.fee;
      if (!sameCurrency) {
        if (!t.exchangeRate || t.exchangeRate <= 0) {
          items.push({
            kind: "currency_mismatch",
            stripe_ref: r.stripe_ref,
            balance_txn_id: t.id,
            receipt_id: r.id,
            currency: r.currency,
            expected_minor: null,
            actual_minor: t.fee,
            note: `Settled in ${t.currency.toUpperCase()} with no exchange rate; fee not applied`,
          });
          continue;
        }
        fee = Math.round(t.fee / t.exchangeRate);
      }
      if (r.fee_minor === null || r.fee_minor !== fee) {
        corrections.push({ receiptId: r.id, feeMinor: fee, balanceTxnId: t.id, knownFeeMinor: r.fee_minor });
      }
    }
  }

  for (const r of receipts) {
    if (seen.has(r.id)) continue;
    if (!["sale", "membership", "refund", "dispute", "dispute_reversal"].includes(r.kind)) continue;
    const at = Date.parse(r.occurred_at) / 1000;
    if (!(at >= fromS && at < toS)) continue;
    if (r.gross_minor === 0) continue;
    items.push({
      kind: "missing_in_stripe",
      stripe_ref: r.stripe_ref,
      balance_txn_id: r.balance_txn_id,
      receipt_id: r.id,
      currency: r.currency,
      expected_minor: r.gross_minor,
      actual_minor: null,
      note: `Ledger ${r.kind} with no Stripe balance transaction in the window`,
    });
  }

  return { stripeTxns: considered, matched, items, corrections };
}

/** The window the daily job checks: the three whole days before the last hour. */
export function reconciliationWindow(now: Date): { from: Date; to: Date; fetchFrom: Date; fetchTo: Date } {
  const to = new Date(now.getTime() - 60 * 60 * 1000);
  const from = new Date(to.getTime() - 3 * 86_400_000);
  return { from, to, fetchFrom: new Date(from.getTime() - 86_400_000), fetchTo: now };
}

/** Is this Stripe key a test-mode key? Live payouts and live reconciliation are locked until Crent flips them. */
export function isTestKey(key: string | undefined | null): boolean {
  return typeof key === "string" && /^(sk|rk)_test_/.test(key);
}
