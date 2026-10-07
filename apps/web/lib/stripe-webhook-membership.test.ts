import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import type { SubscriptionState } from "@/lib/membership";
import type { OutboundMessage } from "@akana/emails";
import { sendMembershipNotice } from "@/lib/membership-email";
import {
  handleStripeEvent,
  renewalDedupeKey,
  type GrantDetails,
  type InvoiceRecord,
  type InvoiceRecordResult,
  type MembershipRepo,
  type PurchaseRef,
  type PurchaseRepo,
  type SubscriptionUpsertResult,
} from "@/lib/stripe-webhook";

/**
 * Membership events (F-097). No network: the repos are in-memory fakes that
 * behave like app.upsert_subscription and app.record_subscription_invoice
 * (idempotent, older observations ignored).
 */

const USER = "55555555-5555-4555-8555-555555555555";
const TENANT = "00000000-0000-0000-0000-00000000000a";

class FakePurchases implements PurchaseRepo {
  purchases = new Map<string, PurchaseRef & { sessionId: string }>();
  grants: { id: string; details: GrantDetails }[] = [];
  seed(id: string, sessionId: string, status: PurchaseRef["status"]) {
    this.purchases.set(id, { id, status, sessionId });
  }
  async findBySessionId(sessionId: string) {
    return [...this.purchases.values()].find((p) => p.sessionId === sessionId) ?? null;
  }
  async findByPaymentIntentId() {
    return null;
  }
  async grant(id: string, details: GrantDetails) {
    this.grants.push({ id, details });
    this.purchases.get(id)!.status = "paid";
  }
  async revoke() {}
  async markFailed() {}
}

class FakeMembership implements MembershipRepo {
  subs = new Map<string, SubscriptionState>();
  invoices = new Map<string, InvoiceRecord>();
  syncs: [string, string][] = [];
  upserts = 0;
  fresh = new Map<string, Stripe.Subscription>();
  retrieveSubscription?: (id: string) => Promise<Stripe.Subscription | null>;
  customerEmail?: (id: string) => Promise<string | null>;
  cancelInCoolingOff?: MembershipRepo["cancelInCoolingOff"];

  withStripe() {
    this.retrieveSubscription = async (id) => this.fresh.get(id) ?? null;
    return this;
  }

  async upsertSubscription(s: SubscriptionState): Promise<SubscriptionUpsertResult> {
    this.upserts += 1;
    const prev = this.subs.get(s.subscriptionId);
    if (!prev && (!s.userId || !s.tenantId)) {
      const linked = [...this.subs.values()].find((x) => x.customerId === s.customerId);
      if (!linked) return "unlinked";
      s = { ...s, userId: linked.userId, tenantId: linked.tenantId };
    }
    if (prev && s.observedAt < prev.observedAt) return "stale";
    const same = prev && JSON.stringify({ ...prev, observedAt: 0 }) === JSON.stringify({ ...s, userId: prev.userId, tenantId: prev.tenantId, observedAt: 0 });
    this.subs.set(s.subscriptionId, prev ? { ...s, userId: prev.userId, tenantId: prev.tenantId } : s);
    return same ? "unchanged" : "applied";
  }
  async syncMembership(userId: string, tenantId: string) {
    this.syncs.push([userId, tenantId]);
  }
  async recordInvoice(r: InvoiceRecord): Promise<InvoiceRecordResult> {
    if (![...this.subs.values()].some((s) => s.subscriptionId === r.subscriptionId)) return "unlinked";
    const prev = this.invoices.get(r.invoiceId);
    if (prev && (prev.status === "paid" || prev.status === r.status)) return "unchanged";
    this.invoices.set(r.invoiceId, r);
    return "recorded";
  }
}

function event(type: string, object: Record<string, unknown>, id = "evt_1", created = 1_800_000_000): Stripe.Event {
  return {
    id,
    object: "event",
    api_version: "2026-09-30.endive",
    created,
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type,
    data: { object },
  } as unknown as Stripe.Event;
}

function subscription(over: Record<string, unknown> = {}) {
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
    items: { data: [{ id: "si_1", current_period_end: 1_802_000_000, price: { id: "price_1Month", recurring: { interval: "month" } } }] },
    ...over,
  };
}

function invoice(over: Record<string, unknown> = {}) {
  return {
    id: "in_1",
    object: "invoice",
    customer_email: "reader@example.com",
    currency: "gbp",
    amount_due: 800,
    amount_paid: 800,
    total_taxes: [{ amount: 133 }],
    billing_reason: "subscription_cycle",
    period_start: 1_800_000_000,
    period_end: 1_802_000_000,
    parent: { type: "subscription_details", subscription_details: { subscription: "sub_1", metadata: null } },
    ...over,
  };
}

describe("customer.subscription.* (F-097)", () => {
  it("records a new subscription with the reader from its metadata", async () => {
    const m = new FakeMembership();
    const out = await handleStripeEvent(event("customer.subscription.created", subscription()), new FakePurchases(), m);
    expect(out).toMatchObject({ action: "subscription_applied", subscriptionId: "sub_1", purchaseId: null });
    expect(m.subs.get("sub_1")).toMatchObject({ userId: USER, tenantId: TENANT, status: "active", plan: "member_month" });
    expect(out.notify).toBeUndefined();
  });

  it("is idempotent: the same delivery twice changes nothing the second time", async () => {
    const m = new FakeMembership();
    const e = event("customer.subscription.updated", subscription());
    await handleStripeEvent(e, new FakePurchases(), m);
    const again = await handleStripeEvent(e, new FakePurchases(), m);
    expect(again.action).toBe("subscription_unchanged");
  });

  it("ignores an older event that arrives late", async () => {
    const m = new FakeMembership();
    await handleStripeEvent(event("customer.subscription.updated", subscription({ status: "past_due" }), "evt_2", 1_800_000_100), new FakePurchases(), m);
    const late = await handleStripeEvent(event("customer.subscription.updated", subscription(), "evt_1", 1_800_000_000), new FakePurchases(), m);
    expect(late.action).toBe("subscription_stale");
    expect(m.subs.get("sub_1")?.status).toBe("past_due");
  });

  it("records deletion as canceled", async () => {
    const m = new FakeMembership();
    await handleStripeEvent(event("customer.subscription.created", subscription()), new FakePurchases(), m);
    const out = await handleStripeEvent(
      event("customer.subscription.deleted", subscription({ status: "canceled", ended_at: 1_800_000_500 }), "evt_3", 1_800_000_500),
      new FakePurchases(),
      m,
    );
    expect(out.action).toBe("subscription_applied");
    expect(m.subs.get("sub_1")).toMatchObject({ status: "canceled", endedAt: new Date(1_800_000_500 * 1000).toISOString() });
  });

  it("prefers the subscription read fresh from Stripe over the event's copy", async () => {
    const m = new FakeMembership().withStripe();
    m.fresh.set("sub_1", subscription({ status: "canceled" }) as unknown as Stripe.Subscription);
    await handleStripeEvent(event("customer.subscription.updated", subscription({ status: "active" })), new FakePurchases(), m);
    expect(m.subs.get("sub_1")?.status).toBe("canceled");
  });

  it("reports an unlinked subscription and stores nothing", async () => {
    const m = new FakeMembership();
    const out = await handleStripeEvent(event("customer.subscription.created", subscription({ metadata: {}, customer: "cus_unknown" })), new FakePurchases(), m);
    expect(out.action).toBe("subscription_unlinked");
    expect(m.subs.size).toBe(0);
  });

  it("ignores a status Stripe adds later rather than failing the delivery", async () => {
    const m = new FakeMembership();
    const out = await handleStripeEvent(event("customer.subscription.updated", subscription({ status: "brand_new" })), new FakePurchases(), m);
    expect(out.action).toBe("ignored");
  });

  it("acknowledges and ignores membership events when no membership repo is given", async () => {
    const out = await handleStripeEvent(event("customer.subscription.created", subscription()), new FakePurchases());
    expect(out.action).toBe("ignored");
  });
});

describe("checkout.session.completed in subscription mode", () => {
  const session = {
    id: "cs_member_1",
    object: "checkout.session",
    mode: "subscription",
    payment_status: "paid",
    payment_intent: null,
    subscription: "sub_1",
    amount_total: 800,
    currency: "gbp",
    total_details: { amount_tax: 133, amount_discount: 0, amount_shipping: 0 },
    metadata: { user_id: USER, tenant_id: TENANT, plan: "member_month" },
  };

  it("grants through the purchase and records the subscription read from Stripe", async () => {
    const p = new FakePurchases();
    p.seed("p_m1", "cs_member_1", "pending");
    const m = new FakeMembership().withStripe();
    m.fresh.set("sub_1", subscription() as unknown as Stripe.Subscription);
    const out = await handleStripeEvent(event("checkout.session.completed", session), p, m);
    expect(out).toEqual({ eventId: "evt_1", type: "checkout.session.completed", action: "granted", purchaseId: "p_m1" });
    expect(p.grants[0]?.details.subscriptionId).toBe("sub_1");
    expect(m.subs.get("sub_1")?.status).toBe("active");
  });

  it("syncs the entitlement when the subscription cannot be read yet", async () => {
    const p = new FakePurchases();
    p.seed("p_m1", "cs_member_1", "pending");
    const m = new FakeMembership().withStripe();
    await handleStripeEvent(event("checkout.session.completed", session), p, m);
    expect(m.syncs).toEqual([[USER, TENANT]]);
  });

  it("does not grant twice on a repeated delivery", async () => {
    const p = new FakePurchases();
    p.seed("p_m1", "cs_member_1", "paid");
    const out = await handleStripeEvent(event("checkout.session.completed", session), p, new FakeMembership());
    expect(out.action).toBe("already_paid");
    expect(p.grants).toHaveLength(0);
  });
});

describe("invoice.paid and invoice.payment_failed", () => {
  async function seeded() {
    const m = new FakeMembership();
    await handleStripeEvent(event("customer.subscription.created", subscription()), new FakePurchases(), m);
    return m;
  }

  it("records a paid renewal with amounts and tax, once", async () => {
    const m = await seeded();
    const out = await handleStripeEvent(event("invoice.paid", invoice(), "evt_inv"), new FakePurchases(), m);
    expect(out).toMatchObject({ action: "invoice_recorded", subscriptionId: "sub_1" });
    expect(m.invoices.get("in_1")).toMatchObject({ status: "paid", currency: "GBP", amountMinor: 800, taxMinor: 133, billingReason: "subscription_cycle" });
    const again = await handleStripeEvent(event("invoice.paid", invoice(), "evt_inv"), new FakePurchases(), m);
    expect(again.action).toBe("invoice_unchanged");
    expect(again.notify).toBeUndefined();
  });

  it("asks for the failed-payment email once per invoice, with no title in it", async () => {
    const m = await seeded();
    const out = await handleStripeEvent(event("invoice.payment_failed", invoice({ amount_paid: 0 }), "evt_f1"), new FakePurchases(), m);
    expect(out.action).toBe("invoice_recorded");
    expect(out.notify).toEqual({ template: "payment_failed", to: "reader@example.com", invoiceId: "in_1", amountMinor: 800, currency: "GBP", dedupeKey: "payment_failed:in_1" });
    expect(JSON.stringify(out.notify)).not.toMatch(/title/i);
    const retry = await handleStripeEvent(event("invoice.payment_failed", invoice({ amount_paid: 0 }), "evt_f2"), new FakePurchases(), m);
    expect(retry.action).toBe("invoice_unchanged");
    expect(retry.notify).toBeUndefined();
  });

  it("sends no email for a failure during the first checkout", async () => {
    const m = await seeded();
    const out = await handleStripeEvent(
      event("invoice.payment_failed", invoice({ billing_reason: "subscription_create" })),
      new FakePurchases(),
      m,
    );
    expect(out.notify).toBeUndefined();
  });

  it("keeps a paid invoice paid when a late failure for it arrives", async () => {
    const m = await seeded();
    await handleStripeEvent(event("invoice.paid", invoice()), new FakePurchases(), m);
    const late = await handleStripeEvent(event("invoice.payment_failed", invoice()), new FakePurchases(), m);
    expect(late.action).toBe("invoice_unchanged");
    expect(m.invoices.get("in_1")?.status).toBe("paid");
  });

  it("ignores an invoice that is not for a subscription", async () => {
    const m = await seeded();
    const out = await handleStripeEvent(event("invoice.paid", invoice({ parent: null })), new FakePurchases(), m);
    expect(out.action).toBe("ignored");
  });

  it("reports an invoice for a subscription it does not know", async () => {
    const m = new FakeMembership();
    const out = await handleStripeEvent(event("invoice.paid", invoice()), new FakePurchases(), m);
    expect(out.action).toBe("invoice_unlinked");
  });
});

describe("invoice.upcoming: renewal reminders (DMCC subscription regime)", () => {
  const RENEWS = 1_831_507_200; // 2028-01-15T00:00:00Z
  const yearly = (over: Record<string, unknown> = {}) =>
    subscription({
      metadata: { user_id: USER, tenant_id: TENANT, plan: "member_year" },
      items: { data: [{ id: "si_1", current_period_end: RENEWS, price: { id: "price_1Year", recurring: { interval: "year" } } }] },
      ...over,
    });
  const upcoming = (over: Record<string, unknown> = {}) =>
    invoice({
      id: undefined,
      amount_due: 6999,
      amount_paid: 0,
      billing_reason: "upcoming",
      customer: "cus_1",
      lines: { data: [{ period: { start: RENEWS, end: RENEWS + 366 * 86_400 } }] },
      ...over,
    });

  function membershipWith(sub: Record<string, unknown> | null) {
    const m = new FakeMembership().withStripe();
    if (sub) m.fresh.set("sub_1", sub as unknown as Stripe.Subscription);
    return m;
  }

  it("asks for renewal_notice on a yearly membership, with the date and amount and no title", async () => {
    const m = membershipWith(yearly());
    const out = await handleStripeEvent(event("invoice.upcoming", upcoming(), "evt_up1"), new FakePurchases(), m);
    expect(out.action).toBe("renewal_reminder");
    expect(out.notify).toEqual({
      template: "renewal_notice",
      to: "reader@example.com",
      subscriptionId: "sub_1",
      renewsAt: "2028-01-15T00:00:00.000Z",
      amountMinor: 6999,
      currency: "GBP",
      dedupeKey: "renewal_notice:sub_1:2028-01-15",
    });
    expect(JSON.stringify(out.notify)).not.toMatch(/title/i);
    // The subscription mirror is refreshed on the way.
    expect(m.subs.get("sub_1")?.plan).toBe("member_year");
  });

  it("does nothing for a monthly membership (six-monthly reminder is a follow-up)", async () => {
    const m = membershipWith(subscription());
    const out = await handleStripeEvent(
      event("invoice.upcoming", upcoming({ amount_due: 799, lines: { data: [{ period: { start: RENEWS, end: RENEWS + 31 * 86_400 } }] } })),
      new FakePurchases(),
      m,
    );
    expect(out.action).toBe("renewal_reminder_not_needed");
    expect(out.notify).toBeUndefined();
  });

  it("falls back to the invoice's own period when Stripe cannot be read", async () => {
    const yearOut = await handleStripeEvent(event("invoice.upcoming", upcoming()), new FakePurchases(), new FakeMembership());
    expect(yearOut.notify).toMatchObject({ template: "renewal_notice", renewsAt: "2028-01-15T00:00:00.000Z" });
    const monthOut = await handleStripeEvent(
      event("invoice.upcoming", upcoming({ lines: { data: [{ period: { start: RENEWS, end: RENEWS + 30 * 86_400 } }] } })),
      new FakePurchases(),
      new FakeMembership(),
    );
    expect(monthOut.action).toBe("renewal_reminder_not_needed");
  });

  it("sends nothing when the member has already cancelled or is not in good standing", async () => {
    for (const sub of [yearly({ cancel_at_period_end: true }), yearly({ status: "past_due" }), yearly({ status: "canceled" })]) {
      const out = await handleStripeEvent(event("invoice.upcoming", upcoming()), new FakePurchases(), membershipWith(sub));
      expect(out.action).toBe("renewal_reminder_not_needed");
      expect(out.notify).toBeUndefined();
    }
  });

  it("looks up the customer's email when the upcoming invoice has none", async () => {
    const m = membershipWith(yearly());
    m.customerEmail = async (id) => (id === "cus_1" ? "found@example.com" : null);
    const out = await handleStripeEvent(event("invoice.upcoming", upcoming({ customer_email: null })), new FakePurchases(), m);
    expect(out.notify?.to).toBe("found@example.com");
    const none = await handleStripeEvent(event("invoice.upcoming", upcoming({ customer_email: null })), new FakePurchases(), membershipWith(yearly()));
    expect(none.action).toBe("renewal_reminder_no_address");
  });

  it("ignores an upcoming invoice that is not for a subscription, or with no membership repo", async () => {
    expect((await handleStripeEvent(event("invoice.upcoming", upcoming({ parent: null })), new FakePurchases(), membershipWith(yearly()))).action).toBe("ignored");
    expect((await handleStripeEvent(event("invoice.upcoming", upcoming()), new FakePurchases())).action).toBe("ignored");
  });

  it("gives the same dedupe key for repeated deliveries of one renewal, and a new one next year", async () => {
    const a = await handleStripeEvent(event("invoice.upcoming", upcoming(), "evt_a"), new FakePurchases(), membershipWith(yearly()));
    const b = await handleStripeEvent(event("invoice.upcoming", upcoming(), "evt_b", 1_800_000_900), new FakePurchases(), membershipWith(yearly()));
    expect(a.notify?.dedupeKey).toBe(b.notify?.dedupeKey);
    const nextYear = RENEWS + 366 * 86_400;
    expect(renewalDedupeKey("sub_1", new Date(nextYear * 1000).toISOString())).not.toBe(a.notify?.dedupeKey);
  });

  it("sends the email once per renewal through the mailer's claim, and retries after a failed send", async () => {
    const claimed = new Set<string>();
    const sent: OutboundMessage[] = [];
    let fail = true;
    const deps = {
      env: { EMAIL_MODE: "live", EMAIL_FROM: "Akana <hello@akana.test>", POSTAL_ADDRESS: "Akana Ltd, 1 Example Street, Edinburgh" },
      claim: (k: string) => (claimed.has(k) ? false : (claimed.add(k), true)),
      release: (k: string) => void claimed.delete(k),
      log: () => {},
      transport: async (msg: OutboundMessage) => {
        if (fail) return { ok: false as const, error: "down" };
        sent.push(msg);
        return { ok: true as const, id: `re_${sent.length}` };
      },
    };
    const out = await handleStripeEvent(event("invoice.upcoming", upcoming()), new FakePurchases(), membershipWith(yearly()));
    const notice = out.notify!;

    expect((await sendMembershipNotice(notice, "https://akana.test", deps)).status).toBe("failed");
    expect(claimed.size).toBe(0);
    fail = false;
    expect((await sendMembershipNotice(notice, "https://akana.test", deps)).status).toBe("sent");
    expect((await sendMembershipNotice(notice, "https://akana.test", deps)).status).toBe("skipped");
    expect(sent).toHaveLength(1);

    const msg = sent[0]!;
    expect(msg.to).toBe("reader@example.com");
    expect(msg.subject).toBe("Your membership renews on 15 January 2028");
    expect(msg.text).toContain("£69.99");
    expect(msg.text).toContain("go to You, then Manage membership, then Cancel before 15 January 2028");
    expect(msg.text).toContain("https://akana.test/you#membership");
    expect(msg.text).not.toMatch(/\bpass\b/i);
  });

});

describe("customer.subscription.updated: a portal cancel inside the cooling-off window", () => {
  const CREATED = 1_800_000_000;
  const portalCancel = (startedDaysAgo: number, over: Record<string, unknown> = {}) =>
    subscription({ start_date: CREATED - startedDaysAgo * 86_400, cancel_at_period_end: true, canceled_at: CREATED, ...over });

  function repo(sub: Record<string, unknown>) {
    const m = new FakeMembership().withStripe();
    m.fresh.set("sub_1", sub as unknown as Stripe.Subscription);
    const calls: [string, string][] = [];
    m.cancelInCoolingOff = async (id, requestedAt) => {
      calls.push([id, requestedAt.toISOString()]);
      return { status: "cancelled", refund: { status: "refunded", amountMinor: 719, currency: "GBP" } };
    };
    return { m, calls };
  }

  it("ends the membership now with a refund when the cancel comes within 14 days of the start", async () => {
    const { m, calls } = repo(portalCancel(3));
    const out = await handleStripeEvent(event("customer.subscription.updated", portalCancel(3), "evt_c1", CREATED), new FakePurchases(), m);
    expect(out).toMatchObject({ action: "cooling_off_cancelled", subscriptionId: "sub_1" });
    expect(calls).toEqual([["sub_1", new Date(CREATED * 1000).toISOString()]]);
    // The mirror still records what Stripe said first; customer.subscription.deleted follows.
    expect(m.subs.get("sub_1")?.cancelAtPeriodEnd).toBe(true);
  });

  it("acts on a cancel_at date too, and counts day 14 as inside", async () => {
    const { m, calls } = repo(portalCancel(14, { cancel_at_period_end: false, cancel_at: CREATED + 20 * 86_400 }));
    const out = await handleStripeEvent(event("customer.subscription.updated", portalCancel(14), "evt_c2", CREATED), new FakePurchases(), m);
    expect(out.action).toBe("cooling_off_cancelled");
    expect(calls).toHaveLength(1);
  });

  it("does nothing extra after 14 days: the membership just stops renewing", async () => {
    const { m, calls } = repo(portalCancel(15));
    const out = await handleStripeEvent(event("customer.subscription.updated", portalCancel(15), "evt_c3", CREATED), new FakePurchases(), m);
    expect(out.action).toBe("subscription_applied");
    expect(calls).toEqual([]);
  });

  it("does nothing for an update with no cancel request, or once the subscription has ended", async () => {
    for (const sub of [portalCancel(3, { cancel_at_period_end: false }), portalCancel(3, { status: "canceled", ended_at: CREATED })]) {
      const { m, calls } = repo(sub);
      await handleStripeEvent(event("customer.subscription.updated", sub, "evt_c4", CREATED), new FakePurchases(), m);
      expect(calls).toEqual([]);
    }
  });

  it("judges the window by the subscription read fresh, so a replay after the cancel does nothing", async () => {
    const { m, calls } = repo(portalCancel(3, { status: "canceled", ended_at: CREATED + 60 }));
    const out = await handleStripeEvent(event("customer.subscription.updated", portalCancel(3), "evt_c1", CREATED), new FakePurchases(), m);
    expect(out.action).not.toBe("cooling_off_cancelled");
    expect(calls).toEqual([]);
  });

  it("lets a Stripe error through so the webhook answers 500 and Stripe retries", async () => {
    const { m } = repo(portalCancel(3));
    m.cancelInCoolingOff = async () => {
      throw Object.assign(new Error("api_connection_error"), { type: "StripeConnectionError" });
    };
    await expect(handleStripeEvent(event("customer.subscription.updated", portalCancel(3), "evt_c5", CREATED), new FakePurchases(), m)).rejects.toThrow();
  });

  it("only stops renewal when no cooling-off repo is given", async () => {
    const m = new FakeMembership().withStripe();
    m.fresh.set("sub_1", portalCancel(3) as unknown as Stripe.Subscription);
    const out = await handleStripeEvent(event("customer.subscription.updated", portalCancel(3), "evt_c6", CREATED), new FakePurchases(), m);
    expect(out.action).toBe("subscription_applied");
  });
});
