import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { feeFromBalanceTxn, type DisputeInfo, type LedgerRepo } from "@/lib/money/ledger";

/**
 * The ledger hooks over the service role client and the Stripe client
 * (F-100). Fee lookups are best effort: when Stripe cannot be read the
 * receipt is written with the fee unknown, and the daily reconciliation
 * fills it in. Refund syncing reads the payment's refunds from Stripe so
 * the order of events does not matter.
 */
export function ledgerRepo(db: SupabaseClient, stripe: Stripe): LedgerRepo {
  async function chargeFee(paymentIntentId: string): Promise<{ feeMinor: number; balanceTxnId: string } | null> {
    try {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge.balance_transaction"] });
      const charge = pi.latest_charge && typeof pi.latest_charge === "object" ? pi.latest_charge : null;
      const txn = charge && charge.balance_transaction && typeof charge.balance_transaction === "object" ? charge.balance_transaction : null;
      return feeFromBalanceTxn(txn, pi.currency);
    } catch {
      return null;
    }
  }

  async function invoicePaymentIntent(invoiceId: string): Promise<string | null> {
    try {
      const list = await stripe.invoicePayments.list({ invoice: invoiceId, limit: 5 });
      for (const p of list.data) {
        if (p.status !== "paid") continue;
        const ref = p.payment?.payment_intent;
        if (ref) return typeof ref === "string" ? ref : ref.id;
      }
    } catch {
      // reconciliation will match by amount later; nothing else to do here
    }
    return null;
  }

  return {
    async recordSale(purchaseId, paymentIntentId, livemode) {
      const fee = paymentIntentId ? await chargeFee(paymentIntentId) : null;
      const { data, error } = await db.rpc("record_sale_receipt", {
        p_purchase: purchaseId,
        p_livemode: livemode,
        p_balance_txn: fee?.balanceTxnId ?? null,
        p_fee_minor: fee?.feeMinor ?? null,
      });
      if (error) throw new Error(`record_sale_receipt failed: ${error.code ?? "unknown"}`);
      return String(data);
    },

    async recordMembership(invoiceId, livemode) {
      const pi = await invoicePaymentIntent(invoiceId);
      const fee = pi ? await chargeFee(pi) : null;
      const { data, error } = await db.rpc("record_membership_receipt", {
        p_invoice: invoiceId,
        p_livemode: livemode,
        p_payment_intent: pi,
        p_balance_txn: fee?.balanceTxnId ?? null,
        p_fee_minor: fee?.feeMinor ?? null,
      });
      if (error) throw new Error(`record_membership_receipt failed: ${error.code ?? "unknown"}`);
      return String(data);
    },

    async syncRefunds(paymentIntentId, livemode) {
      const refunds = await stripe.refunds.list({ payment_intent: paymentIntentId, limit: 100 });
      for (const r of refunds.data) {
        if (r.status !== "succeeded" && r.status !== "pending") continue;
        const { error } = await db.rpc("record_refund", {
          p_kind: "refund",
          p_ref: r.id,
          p_payment_intent: paymentIntentId,
          p_amount_minor: r.amount,
          p_currency: r.currency.toUpperCase(),
          p_livemode: livemode,
          p_occurred_at: new Date(r.created * 1000).toISOString(),
          p_reason: r.metadata?.akana_reason ?? r.reason ?? null,
        });
        if (error) throw new Error(`record_refund failed: ${error.code ?? "unknown"}`);
      }
    },

    async recordDispute(kind, d: DisputeInfo, livemode) {
      const { data, error } = await db.rpc("record_refund", {
        p_kind: kind,
        p_ref: d.id,
        p_payment_intent: d.paymentIntentId,
        p_amount_minor: d.amountMinor,
        p_currency: d.currency,
        p_livemode: livemode,
        p_occurred_at: d.at,
        p_reason: kind === "dispute" ? "dispute opened" : "dispute won",
      });
      if (error) throw new Error(`record_refund (${kind}) failed: ${error.code ?? "unknown"}`);
      return String(data);
    },
  };
}
