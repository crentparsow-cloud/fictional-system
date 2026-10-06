import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { handleStripeEvent, type GrantDetails, type PurchaseRef, type PurchaseRepo, type PurchaseStatus } from "@/lib/stripe-webhook";

/**
 * No network. Events are built locally with the stripe package's types and
 * the signature helper; the repo is an in-memory fake.
 */

const SECRET = "whsec_test_secret_for_unit_tests_only";
const stripe = new Stripe("sk_test_placeholder_never_used", { apiVersion: "2026-09-30.endive" });

class FakeRepo implements PurchaseRepo {
  purchases = new Map<string, PurchaseRef & { sessionId: string; paymentIntentId: string | null }>();
  grants: { id: string; details: GrantDetails }[] = [];
  revokes: { id: string; reason: string }[] = [];
  failed: string[] = [];

  seed(id: string, sessionId: string, status: PurchaseStatus, paymentIntentId: string | null = null) {
    this.purchases.set(id, { id, status, sessionId, paymentIntentId });
  }
  async findBySessionId(sessionId: string) {
    return [...this.purchases.values()].find((p) => p.sessionId === sessionId) ?? null;
  }
  async findByPaymentIntentId(pi: string) {
    return [...this.purchases.values()].find((p) => p.paymentIntentId === pi) ?? null;
  }
  async grant(id: string, details: GrantDetails) {
    this.grants.push({ id, details });
    const p = this.purchases.get(id)!;
    p.status = "paid";
    p.paymentIntentId = details.paymentIntentId;
  }
  async revoke(id: string, reason: string) {
    this.revokes.push({ id, reason });
    this.purchases.get(id)!.status = "refunded";
  }
  async markFailed(id: string) {
    this.failed.push(id);
    this.purchases.get(id)!.status = "failed";
  }
}

function event(type: string, object: Record<string, unknown>, id = "evt_test_1"): Stripe.Event {
  return {
    id,
    object: "event",
    api_version: "2026-09-30.endive",
    created: 1_700_000_000,
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type,
    data: { object },
  } as unknown as Stripe.Event;
}

const completedSession = {
  id: "cs_test_1",
  object: "checkout.session",
  mode: "payment",
  payment_status: "paid",
  payment_intent: "pi_test_1",
  subscription: null,
  amount_total: 1200,
  currency: "gbp",
  total_details: { amount_tax: 200, amount_discount: 0, amount_shipping: 0 },
  metadata: { user_id: "u1", tenant_id: "t1", workbook_id: "w1", code: "AK-TEST1" },
};

describe("handleStripeEvent", () => {
  it("grants on checkout.session.completed with the payment details from the session", async () => {
    const repo = new FakeRepo();
    repo.seed("p1", "cs_test_1", "pending");
    const out = await handleStripeEvent(event("checkout.session.completed", completedSession), repo);
    expect(out).toEqual({ eventId: "evt_test_1", type: "checkout.session.completed", action: "granted", purchaseId: "p1" });
    expect(repo.grants).toHaveLength(1);
    expect(repo.grants[0]?.details).toEqual({ paymentIntentId: "pi_test_1", subscriptionId: null, amountMinor: 1200, taxMinor: 200, currency: "GBP" });
  });

  it("is idempotent: a duplicate completed event grants nothing", async () => {
    const repo = new FakeRepo();
    repo.seed("p1", "cs_test_1", "pending");
    await handleStripeEvent(event("checkout.session.completed", completedSession), repo);
    const again = await handleStripeEvent(event("checkout.session.completed", completedSession, "evt_test_2"), repo);
    expect(again.action).toBe("already_paid");
    expect(repo.grants).toHaveLength(1);
  });

  it("waits when a delayed payment method has not paid yet, then grants on async_payment_succeeded", async () => {
    const repo = new FakeRepo();
    repo.seed("p1", "cs_test_1", "pending");
    const first = await handleStripeEvent(event("checkout.session.completed", { ...completedSession, payment_status: "unpaid" }), repo);
    expect(first.action).toBe("awaiting_payment");
    expect(repo.grants).toHaveLength(0);
    const second = await handleStripeEvent(event("checkout.session.async_payment_succeeded", completedSession), repo);
    expect(second.action).toBe("granted");
  });

  it("marks a pending purchase failed on async_payment_failed", async () => {
    const repo = new FakeRepo();
    repo.seed("p1", "cs_test_1", "pending");
    const out = await handleStripeEvent(event("checkout.session.async_payment_failed", completedSession), repo);
    expect(out.action).toBe("marked_failed");
    expect(repo.failed).toEqual(["p1"]);
  });

  it("acknowledges a session we never started without granting", async () => {
    const repo = new FakeRepo();
    const out = await handleStripeEvent(event("checkout.session.completed", completedSession), repo);
    expect(out.action).toBe("purchase_not_found");
    expect(repo.grants).toHaveLength(0);
  });

  it("revokes on a full charge.refunded and ignores a second one", async () => {
    const repo = new FakeRepo();
    repo.seed("p1", "cs_test_1", "paid", "pi_test_1");
    const charge = { id: "ch_test_1", object: "charge", payment_intent: "pi_test_1", amount: 1200, amount_refunded: 1200, refunded: true };
    const out = await handleStripeEvent(event("charge.refunded", charge), repo);
    expect(out).toEqual({ eventId: "evt_test_1", type: "charge.refunded", action: "revoked", purchaseId: "p1" });
    expect(repo.revokes).toEqual([{ id: "p1", reason: "charge.refunded" }]);
    const again = await handleStripeEvent(event("charge.refunded", charge, "evt_test_2"), repo);
    expect(again.action).toBe("already_refunded");
    expect(repo.revokes).toHaveLength(1);
  });

  it("keeps access on a partial refund and reads an expanded payment intent", async () => {
    const repo = new FakeRepo();
    repo.seed("p1", "cs_test_1", "paid", "pi_test_1");
    const charge = { id: "ch_test_1", object: "charge", payment_intent: { id: "pi_test_1", object: "payment_intent" }, amount: 1200, amount_refunded: 600, refunded: false };
    const out = await handleStripeEvent(event("charge.refunded", charge), repo);
    expect(out.action).toBe("partial_refund_kept");
    expect(repo.revokes).toHaveLength(0);
  });

  it("ignores unknown events", async () => {
    const repo = new FakeRepo();
    const out = await handleStripeEvent(event("customer.created", { id: "cus_1", object: "customer" }), repo);
    expect(out).toEqual({ eventId: "evt_test_1", type: "customer.created", action: "ignored", purchaseId: null });
  });
});

describe("signature verification", () => {
  const payload = JSON.stringify(event("checkout.session.completed", completedSession));

  it("accepts a header signed with the secret and returns the typed event", () => {
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
    const parsed = stripe.webhooks.constructEvent(payload, header, SECRET);
    expect(parsed.type).toBe("checkout.session.completed");
    expect(parsed.id).toBe("evt_test_1");
  });

  it("rejects the wrong secret, a tampered body and a stale timestamp", () => {
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
    expect(() => stripe.webhooks.constructEvent(payload, header, "whsec_other")).toThrow(Stripe.errors.StripeSignatureVerificationError);
    expect(() => stripe.webhooks.constructEvent(payload.replace("1200", "1"), header, SECRET)).toThrow(Stripe.errors.StripeSignatureVerificationError);
    const stale = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET, timestamp: Math.floor(Date.now() / 1000) - 3600 });
    expect(() => stripe.webhooks.constructEvent(payload, stale, SECRET)).toThrow(Stripe.errors.StripeSignatureVerificationError);
  });
});
