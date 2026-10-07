import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import {
  autoRenewNotice,
  hasLiveMembership,
  membershipCheckoutParams,
  membershipLine,
  membershipNotice,
  membershipPlansOpen,
  membershipPriceId,
  membershipSummary,
  planFromInterval,
  portalCustomerId,
  subscriptionStateFrom,
  type SubscriptionRow,
} from "@/lib/membership";

const USER = "55555555-5555-4555-8555-555555555555";
const TENANT = "00000000-0000-0000-0000-00000000000a";

describe("membership prices from env (placeholders until D1 to D4)", () => {
  it("is closed with nothing set, or with something that is not a price id", () => {
    expect(membershipPriceId("monthly", {})).toBeNull();
    expect(membershipPriceId("monthly", { STRIPE_PRICE_MEMBERSHIP_MONTHLY: "  " })).toBeNull();
    expect(membershipPriceId("monthly", { STRIPE_PRICE_MEMBERSHIP_MONTHLY: "prod_123" })).toBeNull();
    expect(membershipPlansOpen({})).toEqual({ monthly: false, yearly: false });
  });

  it("opens each plan on its own", () => {
    const env = { STRIPE_PRICE_MEMBERSHIP_YEARLY: "price_1Year" };
    expect(membershipPriceId("yearly", env)).toBe("price_1Year");
    expect(membershipPlansOpen(env)).toEqual({ monthly: false, yearly: true });
  });
});

describe("membershipCheckoutParams", () => {
  const base = {
    plan: "monthly" as const,
    priceId: "price_1Month",
    userId: USER,
    tenantId: TENANT,
    email: "reader@example.com",
    customerId: null,
    successUrl: "https://akana.test/you",
    cancelUrl: "https://akana.test/you",
  };

  it("is subscription mode with Stripe Tax, promotion codes and the tax id field, like the single checkout", () => {
    const p = membershipCheckoutParams(base);
    expect(p.mode).toBe("subscription");
    expect(p.automatic_tax).toEqual({ enabled: true });
    expect(p.allow_promotion_codes).toBe(true);
    expect(p.tax_id_collection).toEqual({ enabled: true });
    expect(p.line_items).toEqual([{ price: "price_1Month", quantity: 1 }]);
    expect(p.customer_email).toBe("reader@example.com");
    expect(p.customer).toBeUndefined();
    expect("managed_payments" in p).toBe(false);
  });

  it("puts the reader and tenant on the subscription so later events can be tied back", () => {
    const p = membershipCheckoutParams(base);
    expect(p.subscription_data?.metadata).toEqual({ user_id: USER, tenant_id: TENANT, plan: "member_month" });
    expect(p.metadata).toEqual({ user_id: USER, tenant_id: TENANT, plan: "member_month" });
    expect(p.client_reference_id).toBe(USER);
  });

  it("reuses a returning member's customer and lets Stripe Tax update the address", () => {
    const p = membershipCheckoutParams({ ...base, customerId: "cus_123" });
    expect(p.customer).toBe("cus_123");
    expect(p.customer_email).toBeUndefined();
    expect(p.customer_update).toEqual({ name: "auto", address: "auto" });
  });

  it("shows the auto-renewal consent, plainly, with no title anywhere", () => {
    const p = membershipCheckoutParams({ ...base, plan: "yearly" });
    expect(p.custom_text?.submit).toEqual({ message: autoRenewNotice("yearly") });
    expect(autoRenewNotice("yearly")).toContain("renews automatically each year until you cancel");
    expect(autoRenewNotice("monthly")).toContain("each month");
    for (const plan of ["monthly", "yearly"] as const) expect(autoRenewNotice(plan)).not.toMatch(/—|–/);
    expect(JSON.stringify(p)).not.toMatch(/title/i);
  });
});

function sub(over: Partial<Record<string, unknown>> = {}): Stripe.Subscription {
  return {
    id: "sub_1",
    object: "subscription",
    customer: "cus_1",
    status: "active",
    cancel_at_period_end: false,
    cancel_at: null,
    canceled_at: null,
    ended_at: null,
    metadata: { user_id: USER, tenant_id: TENANT, plan: "member_month" },
    items: { data: [{ id: "si_1", current_period_end: 1_800_000_000, price: { id: "price_1Month", recurring: { interval: "month" } } }] },
    ...over,
  } as unknown as Stripe.Subscription;
}

describe("subscriptionStateFrom", () => {
  const at = new Date("2026-10-07T10:00:00Z");

  it("maps a subscription, taking the period end from the item", () => {
    expect(subscriptionStateFrom(sub(), at)).toEqual({
      subscriptionId: "sub_1",
      customerId: "cus_1",
      userId: USER,
      tenantId: TENANT,
      status: "active",
      plan: "member_month",
      priceId: "price_1Month",
      currentPeriodEnd: new Date(1_800_000_000 * 1000).toISOString(),
      cancelAtPeriodEnd: false,
      cancelAt: null,
      canceledAt: null,
      endedAt: null,
      observedAt: at.toISOString(),
    });
  });

  it("reads the plan from the price interval and the customer from an expanded object", () => {
    const s = subscriptionStateFrom(
      sub({ customer: { id: "cus_2" }, items: { data: [{ current_period_end: 1, price: { id: "price_y", recurring: { interval: "year" } } }] } }),
      at,
    );
    expect(s?.plan).toBe("member_year");
    expect(s?.customerId).toBe("cus_2");
  });

  it("ignores metadata that is not a uuid, and falls back to the session's", () => {
    const s = subscriptionStateFrom(sub({ metadata: { user_id: "nope" } }), at, { user_id: USER, tenant_id: TENANT });
    expect(s?.userId).toBe(USER);
    expect(subscriptionStateFrom(sub({ metadata: {} }), at)?.userId).toBeNull();
  });

  it("refuses a status the table does not know", () => {
    expect(subscriptionStateFrom(sub({ status: "something_new" }), at)).toBeNull();
  });

  it("maps intervals", () => {
    expect(planFromInterval("month")).toBe("member_month");
    expect(planFromInterval("year")).toBe("member_year");
    expect(planFromInterval("week")).toBeNull();
  });
});

describe("membership on the You page", () => {
  const row = (over: Partial<SubscriptionRow>): SubscriptionRow => ({
    status: "active",
    plan: "member_month",
    current_period_end: "2026-11-14T10:00:00Z",
    cancel_at_period_end: false,
    ended_at: null,
    stripe_customer_id: "cus_1",
    updated_at: "2026-10-07T10:00:00Z",
    ...over,
  });
  const fmt = (iso: string) => iso.slice(0, 10);

  it("says plainly when there is no membership", () => {
    expect(membershipSummary([])).toEqual({ kind: "none" });
    expect(membershipLine({ kind: "none" }, fmt)).toBe("You are not a member at the moment.");
  });

  it("names the plan and the renewal date", () => {
    const s = membershipSummary([row({})]);
    expect(membershipLine(s, fmt)).toBe("Monthly membership. Renews on 2026-11-14.");
    expect(membershipLine(membershipSummary([row({ plan: "member_year" })]), fmt)).toBe("Annual membership. Renews on 2026-11-14.");
  });

  it("says when a cancelled membership ends", () => {
    expect(membershipLine(membershipSummary([row({ cancel_at_period_end: true })]), fmt)).toBe(
      "Your membership ends on 2026-11-14. It will not renew.",
    );
  });

  it("asks for new payment details when a renewal failed", () => {
    expect(membershipSummary([row({ status: "past_due" })])).toEqual({ kind: "payment_issue" });
  });

  it("prefers a live subscription over an ended one", () => {
    const rows = [row({ status: "canceled", updated_at: "2026-10-08T00:00:00Z" }), row({ status: "trialing" })];
    expect(membershipSummary(rows).kind).toBe("active");
    expect(hasLiveMembership(rows)).toBe(true);
    expect(membershipSummary([row({ status: "canceled" })])).toEqual({ kind: "ended" });
    expect(hasLiveMembership([row({ status: "canceled" })])).toBe(false);
  });

  it("finds the customer for the portal, newest first", () => {
    expect(portalCustomerId([row({ stripe_customer_id: "cus_old", updated_at: "2026-01-01" }), row({ stripe_customer_id: "cus_new" })])).toBe("cus_new");
    expect(portalCustomerId([])).toBeNull();
  });

  it("has calm copy with no em dashes and no pressure words", () => {
    const lines = [
      membershipLine({ kind: "none" }, fmt),
      membershipLine({ kind: "active", plan: "monthly", renewsOn: "2026-11-14" }, fmt),
      membershipLine({ kind: "ending", endsOn: "2026-11-14" }, fmt),
      membershipLine({ kind: "payment_issue" }, fmt),
      membershipLine({ kind: "ended" }, fmt),
      membershipNotice("unavailable") ?? "",
      membershipNotice("welcome") ?? "",
    ].join(" ");
    expect(lines).not.toMatch(/—|–/);
    for (const w of ["hurry", "last chance", "only today", "don't miss"]) expect(lines.toLowerCase()).not.toContain(w);
    expect(membershipNotice("other")).toBeNull();
  });
});
