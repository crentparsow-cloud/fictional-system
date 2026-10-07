import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import type { DisputeInfo, LedgerRepo } from "@/lib/money/ledger";
import { handleStripeEvent, type MembershipRepo, type PurchaseRef, type PurchaseRepo } from "@/lib/stripe-webhook";

/**
 * The webhook's royalty ledger hooks (F-100, migration 0021). No network:
 * the ledger is a fake that records calls.
 */

class FakeLedger implements LedgerRepo {
  calls: string[] = [];
  disputes: { kind: string; d: DisputeInfo }[] = [];
  async recordSale(purchaseId: string, pi: string | null, livemode: boolean) {
    this.calls.push(`sale:${purchaseId}:${pi}:${livemode}`);
    return "recorded";
  }
  async recordMembership(invoiceId: string, livemode: boolean) {
    this.calls.push(`membership:${invoiceId}:${livemode}`);
    return "recorded";
  }
  async syncRefunds(pi: string, livemode: boolean) {
    this.calls.push(`refunds:${pi}:${livemode}`);
  }
  async recordDispute(kind: "dispute" | "dispute_reversal", d: DisputeInfo) {
    this.disputes.push({ kind, d });
    return "recorded";
  }
}

class Purchases implements PurchaseRepo {
  constructor(private p: (PurchaseRef & { pi: string | null }) | null) {}
  async findBySessionId() {
    return this.p;
  }
  async findByPaymentIntentId(pi: string) {
    return this.p && this.p.pi === pi ? this.p : null;
  }
  async grant() {
    if (this.p) this.p.status = "paid";
  }
  async revoke() {
    if (this.p) this.p.status = "refunded";
  }
  async markFailed() {}
}

const membership: MembershipRepo = {
  async upsertSubscription() {
    return "applied";
  },
  async syncMembership() {},
  async recordInvoice() {
    return "recorded";
  },
};

function event(type: string, object: Record<string, unknown>, livemode = false): Stripe.Event {
  return {
    id: "evt_ledger",
    object: "event",
    api_version: "2026-09-30.endive",
    created: 1_700_000_000,
    livemode,
    pending_webhooks: 1,
    request: null,
    type,
    data: { object },
  } as unknown as Stripe.Event;
}

const session = {
  id: "cs_test_l",
  object: "checkout.session",
  mode: "payment",
  payment_status: "paid",
  payment_intent: "pi_l",
  subscription: null,
  amount_total: 1200,
  currency: "gbp",
  total_details: { amount_tax: 200 },
  metadata: {},
};

describe("ledger hooks in the Stripe webhook", () => {
  it("records the sale after the grant, and again harmlessly on a replay", async () => {
    const ledger = new FakeLedger();
    const repo = new Purchases({ id: "p1", status: "pending", pi: "pi_l" });
    const first = await handleStripeEvent(event("checkout.session.completed", session), repo, undefined, ledger);
    expect(first.action).toBe("granted");
    const again = await handleStripeEvent(event("checkout.session.completed", session), repo, undefined, ledger);
    expect(again.action).toBe("already_paid");
    expect(ledger.calls).toEqual(["sale:p1:pi_l:false", "sale:p1:pi_l:false"]);
  });

  it("leaves membership checkouts to invoice.paid", async () => {
    const ledger = new FakeLedger();
    const repo = new Purchases({ id: "p2", status: "pending", pi: null });
    await handleStripeEvent(event("checkout.session.completed", { ...session, mode: "subscription", payment_intent: null }), repo, undefined, ledger);
    expect(ledger.calls).toEqual([]);
  });

  it("records a paid membership invoice for the pool, but not a failed one", async () => {
    const ledger = new FakeLedger();
    const invoice = {
      id: "in_l",
      object: "invoice",
      currency: "gbp",
      amount_paid: 799,
      amount_due: 799,
      total_taxes: [{ amount: 133 }],
      billing_reason: "subscription_cycle",
      parent: { subscription_details: { subscription: "sub_l" } },
      period_start: 1_700_000_000,
      period_end: 1_702_000_000,
    };
    await handleStripeEvent(event("invoice.paid", invoice, true), new Purchases(null), membership, ledger);
    await handleStripeEvent(event("invoice.payment_failed", invoice), new Purchases(null), membership, ledger);
    expect(ledger.calls).toEqual(["membership:in_l:true"]);
  });

  it("syncs refunds for any payment, even one with no purchase row", async () => {
    const ledger = new FakeLedger();
    const charge = { id: "ch_l", object: "charge", payment_intent: "pi_member", amount: 799, amount_refunded: 300 };
    const out = await handleStripeEvent(event("charge.refunded", charge), new Purchases(null), undefined, ledger);
    expect(out.action).toBe("purchase_not_found");
    expect(ledger.calls).toEqual(["refunds:pi_member:false"]);
  });

  it("reverses on a dispute and restores when it is won, not when it is lost", async () => {
    const ledger = new FakeLedger();
    const dispute = { id: "du_l", object: "dispute", amount: 1200, currency: "gbp", payment_intent: "pi_l", created: 1_700_000_000, status: "needs_response" };
    const opened = await handleStripeEvent(event("charge.dispute.created", dispute), new Purchases(null), undefined, ledger);
    expect(opened.action).toBe("dispute_recorded");
    await handleStripeEvent(event("charge.dispute.closed", { ...dispute, status: "lost" }), new Purchases(null), undefined, ledger);
    await handleStripeEvent(event("charge.dispute.closed", { ...dispute, status: "won" }), new Purchases(null), undefined, ledger);
    expect(ledger.disputes.map((x) => x.kind)).toEqual(["dispute", "dispute_reversal"]);
    expect(ledger.disputes[0]?.d).toMatchObject({ id: "du_l", paymentIntentId: "pi_l", amountMinor: 1200, currency: "GBP" });
  });

  it("does nothing new without a ledger", async () => {
    const out = await handleStripeEvent(event("charge.dispute.created", { id: "du_x", amount: 1, currency: "gbp", payment_intent: "pi_x", created: 1 }), new Purchases(null));
    expect(out.action).toBe("ignored");
  });
});
