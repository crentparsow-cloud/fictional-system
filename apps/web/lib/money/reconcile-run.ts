import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { isReceiptTxn, reconcile, reconciliationWindow, type ReceiptRow, type ReconItem, type StripeTxn } from "@/lib/money/reconcile";

/**
 * The daily reconciliation job (F-100): list Stripe balance transactions
 * for the window, read the ledger's receipts, compare, teach the ledger the
 * fees it did not know, and record the run with anything a person should
 * look at. Service role client only.
 */
export async function runReconciliation(db: SupabaseClient, stripe: Stripe, livemode: boolean, now = new Date()) {
  const w = reconciliationWindow(now);
  const txns: StripeTxn[] = [];
  const list = stripe.balanceTransactions.list({
    created: { gte: Math.floor(w.fetchFrom.getTime() / 1000), lt: Math.floor(w.fetchTo.getTime() / 1000) },
    limit: 100,
    expand: ["data.source"],
  });
  for await (const t of list) {
    if (!isReceiptTxn(t.type)) continue;
    const src = t.source && typeof t.source === "object" ? (t.source as { id: string; object?: string; payment_intent?: unknown }) : null;
    const pi = src && src.object === "charge" ? src.payment_intent : null;
    txns.push({
      id: t.id,
      type: t.type,
      amount: t.amount,
      fee: t.fee,
      currency: t.currency,
      created: t.created,
      exchangeRate: t.exchange_rate ?? null,
      paymentIntentId: typeof pi === "string" ? pi : pi && typeof pi === "object" && "id" in pi ? String((pi as { id: string }).id) : null,
      sourceId: src ? src.id : typeof t.source === "string" ? t.source : null,
    });
    if (txns.length >= 5000) break;
  }

  const { data, error } = await db.rpc("receipts_for_reconciliation", {
    p_livemode: livemode,
    p_from: w.fetchFrom.toISOString(),
    p_to: w.fetchTo.toISOString(),
  });
  if (error) throw new Error(`receipts_for_reconciliation failed: ${error.code ?? "unknown"}`);
  const receipts = ((data ?? []) as ReceiptRow[]).map((r) => ({
    ...r,
    gross_minor: Number(r.gross_minor),
    fee_minor: r.fee_minor === null ? null : Number(r.fee_minor),
  }));

  const result = reconcile(txns, receipts, { from: w.from, to: w.to });
  const items: ReconItem[] = [...result.items];
  let corrected = 0;
  for (const c of result.corrections) {
    const { data: outcome, error: e } = await db.rpc("record_fee_correction", {
      p_receipt: c.receiptId,
      p_fee_minor: c.feeMinor,
      p_balance_txn: c.balanceTxnId,
    });
    if (e) {
      items.push({
        kind: "fee_mismatch",
        stripe_ref: null,
        balance_txn_id: c.balanceTxnId,
        receipt_id: c.receiptId,
        currency: null,
        expected_minor: c.knownFeeMinor,
        actual_minor: c.feeMinor,
        note: `Fee correction failed: ${e.code ?? "unknown"}`,
      });
      continue;
    }
    if (outcome === "corrected") {
      corrected++;
      items.push({
        kind: "fee_corrected",
        stripe_ref: null,
        balance_txn_id: c.balanceTxnId,
        receipt_id: c.receiptId,
        currency: null,
        expected_minor: c.knownFeeMinor,
        actual_minor: c.feeMinor,
        note: "Stripe fee recorded",
      });
    }
  }

  const { data: runId, error: re } = await db.rpc("record_reconciliation", {
    p_livemode: livemode,
    p_from: w.from.toISOString(),
    p_to: w.to.toISOString(),
    p_stripe_txns: result.stripeTxns,
    p_matched: result.matched,
    p_corrected: corrected,
    p_items: items,
  });
  if (re) throw new Error(`record_reconciliation failed: ${re.code ?? "unknown"}`);
  const issues = items.filter((i) => i.kind !== "fee_corrected").length;
  return { runId: String(runId), stripeTxns: result.stripeTxns, matched: result.matched, corrected, issues };
}
