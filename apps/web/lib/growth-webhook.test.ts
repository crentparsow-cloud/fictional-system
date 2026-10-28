import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { growthAfterStripeEvent, type GrowthContext } from "./growth-webhook";
import type { ReversalRow } from "./referral-reward";

function ctx(rpcResults: Record<string, unknown> = {}, reversalRow: ReversalRow | null = null) {
  const rpcs: string[] = [];
  const reward: string[] = [];
  const c: GrowthContext = {
    db: {
      async rpc(name, args) {
        rpcs.push(`${name}:${JSON.stringify(args)}`);
        return { data: rpcResults[name] ?? null, error: null };
      },
      async subscription(id) {
        return id === "sub_1" ? { userId: "u1", customerId: "cus_1" } : null;
      },
    },
    reward: {
      pendingReferrer: async () => {
        reward.push("pendingReferrer");
        return null;
      },
      paymentInfo: async () => ({ fingerprint: null, paymentIntentId: null, disputed: false }),
      referrerState: async () => ({ customerId: null, subscriptionId: null, trialing: false, trialEnd: null }),
      customerFingerprints: async () => [],
      claim: async () => null,
      addCredit: async (a) => {
        reward.push(`credit:${a.key}`);
        return "txn";
      },
      extendTrial: async () => undefined,
      rewardGiven: async () => undefined,
      creditApplied: async (id) => void reward.push(`applied:${id}`),
    },
    reversal: {
      reverse: async (pi, reason) => {
        reward.push(`reverse:${pi}:${reason}`);
        return reversalRow;
      },
      referrerState: async () => ({ customerId: "cus_ref", subscriptionId: null, trialing: false, trialEnd: null }),
      debitCredit: async (a) => {
        reward.push(`debit:${a.key}`);
        return "txn_back";
      },
      setTrialEnd: async () => undefined,
      reversed: async (id) => void reward.push(`reversed:${id}`),
    },
  };
  return { c, rpcs, reward };
}

const invoicePaid = (over: Partial<Stripe.Invoice> = {}) =>
  ({
    type: "invoice.paid",
    livemode: false,
    data: { object: { id: "in_1", amount_paid: 799, currency: "gbp", parent: { subscription_details: { subscription: "sub_1" } }, ...over } },
  }) as unknown as Stripe.Event;

describe("growthAfterStripeEvent", () => {
  it("records the author share, then looks for waiting credit and a reader referral on a paid invoice", async () => {
    const { c, rpcs, reward } = ctx({ record_author_referral_share: "recorded" });
    const done = await growthAfterStripeEvent(invoicePaid(), c);
    expect(done).toEqual(["author_share"]);
    expect(rpcs[0]).toBe('record_author_referral_share:{"p_invoice":"in_1","p_livemode":false}');
    expect(rpcs[1]).toContain("credits_pending");
    expect(reward).toEqual(["pendingReferrer"]);
  });

  it("skips the share on an invoice that took no money but still checks for waiting credit", async () => {
    const { c, rpcs } = ctx();
    await growthAfterStripeEvent(invoicePaid({ amount_paid: 0 }), c);
    expect(rpcs.some((r) => r.startsWith("record_author_referral_share"))).toBe(false);
    expect(rpcs.some((r) => r.startsWith("credits_pending"))).toBe(true);
  });

  it("applies credit that was waiting for a customer", async () => {
    const { c, reward } = ctx({ credits_pending: [{ id: "cr1", amount_minor: 500, currency: "GBP" }] });
    const done = await growthAfterStripeEvent(invoicePaid({ amount_paid: 0 }), c);
    expect(done).toContain("credit_applied");
    expect(reward).toContain("credit:credit:cr1");
    expect(reward).toContain("applied:cr1");
  });

  it("ignores an invoice with no subscription or one we do not know", async () => {
    const { c, rpcs } = ctx();
    expect(await growthAfterStripeEvent(invoicePaid({ parent: null } as never), c)).toEqual([]);
    expect(await growthAfterStripeEvent(invoicePaid({ parent: { subscription_details: { subscription: "sub_x" } } } as never), c)).toEqual([]);
    expect(rpcs).toEqual([]);
  });

  it("throws when a database call fails so Stripe retries", async () => {
    const { c } = ctx();
    c.db.rpc = async () => ({ data: null, error: { code: "42501" } });
    await expect(growthAfterStripeEvent(invoicePaid(), c)).rejects.toThrow("record_author_referral_share failed: 42501");
  });

  it("reverses the share on a refund", async () => {
    const { c, rpcs } = ctx({ reverse_author_referral_share: "recorded" });
    const ev = { type: "charge.refunded", livemode: true, data: { object: { payment_intent: "pi_1", amount_refunded: 400 } } } as unknown as Stripe.Event;
    expect(await growthAfterStripeEvent(ev, c)).toEqual(["author_share_reversed"]);
    expect(rpcs[0]).toBe('reverse_author_referral_share:{"p_payment_intent":"pi_1","p_refunded_minor":400,"p_livemode":true}');
  });

  it("leaves the referral reward alone on a part refund", async () => {
    const { c, reward } = ctx({ reverse_author_referral_share: "recorded" });
    const ev = { type: "charge.refunded", livemode: true, data: { object: { payment_intent: "pi_1", amount_refunded: 400, refunded: false } } } as unknown as Stripe.Event;
    await growthAfterStripeEvent(ev, c);
    expect(reward.some((r) => r.startsWith("reverse:"))).toBe(false);
  });

  it("takes the referral reward back when the first payment is fully refunded", async () => {
    const row: ReversalRow = { referralId: "r1", referrerId: "u_ref", action: "debit", value: 500, currency: "GBP", trialEndTarget: null };
    const { c, reward } = ctx({}, row);
    const ev = { type: "charge.refunded", livemode: true, data: { object: { payment_intent: "pi_1", amount_refunded: 799, refunded: true } } } as unknown as Stripe.Event;
    expect(await growthAfterStripeEvent(ev, c)).toEqual(["referral_credit_taken_back"]);
    expect(reward).toEqual(["reverse:pi_1:refunded", "debit:referral-reversal:r1", "reversed:r1"]);
  });

  it("takes the referral reward back when the first payment is disputed", async () => {
    const row: ReversalRow = { referralId: "r1", referrerId: "u_ref", action: "debit", value: 500, currency: "GBP", trialEndTarget: null };
    const { c, reward } = ctx({}, row);
    const ev = { type: "charge.dispute.created", livemode: true, data: { object: { payment_intent: "pi_9" } } } as unknown as Stripe.Event;
    expect(await growthAfterStripeEvent(ev, c)).toEqual(["referral_credit_taken_back"]);
    expect(reward[0]).toBe("reverse:pi_9:disputed");
  });

  it("does nothing for other events", async () => {
    const { c, rpcs } = ctx();
    expect(await growthAfterStripeEvent({ type: "customer.created", data: { object: {} } } as unknown as Stripe.Event, c)).toEqual([]);
    expect(rpcs).toEqual([]);
  });
});
