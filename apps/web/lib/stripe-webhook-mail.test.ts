import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDevTransport, type SendLogEntry } from "@akana/emails";
import {
  handleStripeEvent,
  membershipMailKey,
  purchaseMailKey,
  refundMailKey,
  type GrantDetails,
  type MembershipRepo,
  type PurchaseRef,
  type PurchaseRepo,
  type ReaderContact,
  type ReaderMailNotice,
  type RefundSummary,
} from "@/lib/stripe-webhook";
import { purchaseEmailProps, sendPurchaseEmail } from "@/lib/purchase-email";
import { withEmailOps } from "@/lib/mail-ops";

/**
 * 0031 mail gaps: the purchase, membership and refund confirmation emails
 * the webhook asks for, and the one-email rule between the refund console
 * and charge.refunded. No network: the claim table is a Set shared by the
 * console's mailer and the webhook's, as public.email_claims is in production.
 */

const claims = new Set<string>();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (fn: string, args: { p_key: string }) => {
      if (fn === "claim_email") {
        if (claims.has(args.p_key)) return { data: false, error: null };
        claims.add(args.p_key);
        return { data: true, error: null };
      }
      if (fn === "release_email") {
        claims.delete(args.p_key);
        return { data: true, error: null };
      }
      return { data: null, error: { code: "unexpected" } };
    },
    auth: { admin: { getUserById: async () => ({ data: { user: { email: "sam@example.test" } }, error: null }) } },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { display_name: "Sam Reader" } }) }) }) }),
  }),
}));

const env = { EMAIL_FROM: "Akana <hello@akana.test>", EMAIL_REPLY_TO: "help@akana.test", POSTAL_ADDRESS: "PLACEHOLDER", EMAIL_MODE: "test", TEST_RECIPIENT: "inbox@akana.test" };
const TITLE = "The Quiet Hours Workbook";

class Purchases implements PurchaseRepo {
  grants: string[] = [];
  revokes: string[] = [];
  refunds: RefundSummary[] = [];
  contacts = new Map<string, ReaderContact>([["u1", { email: "sam@example.test", name: "Sam Reader" }]]);
  constructor(public p: (PurchaseRef & { sessionId: string; pi: string | null }) | null) {}
  async findBySessionId(id: string) {
    return this.p && this.p.sessionId === id ? this.p : null;
  }
  async findByPaymentIntentId(pi: string) {
    return this.p && this.p.pi === pi ? this.p : null;
  }
  async grant(id: string, d: GrantDetails) {
    this.grants.push(id);
    if (this.p) {
      this.p.status = "paid";
      this.p.pi = d.paymentIntentId;
    }
  }
  async revoke(id: string) {
    this.revokes.push(id);
    if (this.p) this.p.status = "refunded";
  }
  async markFailed() {}
  async readerContact(userId: string) {
    return this.contacts.get(userId) ?? null;
  }
  async listRefunds() {
    return this.refunds;
  }
}

function event(type: string, object: Record<string, unknown>, id = "evt_mail"): Stripe.Event {
  return {
    id,
    object: "event",
    api_version: "2026-09-30.endive",
    created: 1_791_000_000,
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type,
    data: { object },
  } as unknown as Stripe.Event;
}

const session = {
  id: "cs_mail",
  object: "checkout.session",
  mode: "payment",
  payment_status: "paid",
  payment_intent: "pi_mail",
  subscription: null,
  amount_total: 999,
  currency: "gbp",
  customer_details: { email: "typed-at-checkout@example.test" },
  total_details: { amount_tax: 167 },
  metadata: { user_id: "u1", tenant_id: "t1", workbook_id: "w1" },
};

function sendDeps(log: SendLogEntry[] = []) {
  const dev = createDevTransport();
  return {
    dev,
    log,
    deps: {
      env,
      transport: dev.transport,
      claim: (k: string) => (claims.has(k) ? false : (claims.add(k), true)),
      release: (k: string) => void claims.delete(k),
      log: (e: SendLogEntry) => void log.push(e),
    },
  };
}

beforeEach(() => claims.clear());

describe("purchase confirmation", () => {
  it("asks for purchase_lifetime once a single purchase is paid, to the sign-in address, with no title", async () => {
    const repo = new Purchases({ id: "p1", status: "pending", userId: "u1", sessionId: "cs_mail", pi: null });
    const out = await handleStripeEvent(event("checkout.session.completed", session), repo);
    expect(out.action).toBe("granted");
    expect(out.mail).toEqual([
      {
        template: "purchase_lifetime",
        to: "sam@example.test",
        name: "Sam Reader",
        userId: "u1",
        purchaseId: "p1",
        amountMinor: 999,
        currency: "GBP",
        dedupeKey: purchaseMailKey("p1"),
      },
    ]);
    expect(JSON.stringify(out.mail)).not.toContain("w1");
  });

  it("falls back to the checkout address when the account address cannot be read", async () => {
    const repo = new Purchases({ id: "p1", status: "pending", userId: "u_unknown", sessionId: "cs_mail", pi: null });
    const out = await handleStripeEvent(event("checkout.session.completed", { ...session, metadata: {} }), repo);
    expect(out.mail?.[0]?.to).toBe("typed-at-checkout@example.test");
  });

  it("sends one email when completed and async_payment_succeeded both arrive", async () => {
    const repo = new Purchases({ id: "p1", status: "pending", userId: "u1", sessionId: "cs_mail", pi: null });
    const { deps, dev } = sendDeps();
    for (const type of ["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.completed"]) {
      const out = await handleStripeEvent(event(type, session), repo);
      for (const n of out.mail ?? []) await sendPurchaseEmail(n, "https://akana.test", deps);
    }
    expect(repo.grants).toEqual(["p1"]);
    expect(dev.sends).toHaveLength(1);
    expect(dev.sends[0]?.subject).not.toContain(TITLE);
    expect(dev.sends[0]?.text).toContain("£9.99");
  });

  it("asks for nothing while the payment is still on its way, or for a membership checkout", async () => {
    const repo = new Purchases({ id: "p1", status: "pending", userId: "u1", sessionId: "cs_mail", pi: null });
    const unpaid = await handleStripeEvent(event("checkout.session.completed", { ...session, payment_status: "unpaid" }), repo);
    expect(unpaid.mail).toBeUndefined();
    const member = await handleStripeEvent(event("checkout.session.completed", { ...session, mode: "subscription", payment_intent: null }), repo);
    expect(member.mail).toBeUndefined();
  });

  it("asks for nothing for a purchase that was already refunded", async () => {
    const repo = new Purchases({ id: "p1", status: "refunded", userId: "u1", sessionId: "cs_mail", pi: "pi_mail" });
    const out = await handleStripeEvent(event("checkout.session.completed", session), repo);
    expect(out.action).toBe("already_refunded");
    expect(out.mail).toBeUndefined();
  });
});

describe("membership confirmation", () => {
  const periodEnd = 1_793_600_000;
  const sub = (plan: string) =>
    ({
      id: "sub_mail",
      object: "subscription",
      status: "active",
      customer: "cus_mail",
      cancel_at_period_end: false,
      cancel_at: null,
      canceled_at: null,
      ended_at: null,
      start_date: 1_791_000_000,
      metadata: { user_id: "11111111-1111-4111-8111-111111111111", tenant_id: "22222222-2222-4222-8222-222222222222", plan },
      items: { data: [{ current_period_end: periodEnd, price: { id: "price_m", metadata: { plan } } }] },
    }) as unknown as Stripe.Subscription;

  function membership(plan = "member_month"): MembershipRepo & { invoices: Set<string> } {
    const invoices = new Set<string>();
    return {
      invoices,
      async upsertSubscription() {
        return "applied";
      },
      async syncMembership() {},
      async recordInvoice(r) {
        if (invoices.has(r.invoiceId)) return "unchanged";
        invoices.add(r.invoiceId);
        return "recorded";
      },
      async retrieveSubscription() {
        return sub(plan);
      },
    };
  }

  const invoice = (o: Record<string, unknown> = {}) => ({
    id: "in_first",
    object: "invoice",
    customer: "cus_mail",
    customer_email: "billing@example.test",
    currency: "gbp",
    amount_paid: 799,
    amount_due: 799,
    billing_reason: "subscription_create",
    parent: { subscription_details: { subscription: "sub_mail" } },
    lines: { data: [] },
    ...o,
  });

  it("asks for purchase_membership on the first paid invoice, once per subscription", async () => {
    const repo = new Purchases(null);
    repo.contacts.set("11111111-1111-4111-8111-111111111111", { email: "member@example.test", name: null });
    const m = membership();
    const out = await handleStripeEvent(event("invoice.paid", invoice()), repo, m);
    const n = out.mail?.[0];
    expect(n).toMatchObject({
      template: "purchase_membership",
      to: "member@example.test",
      subscriptionId: "sub_mail",
      plan: "member_month",
      amountMinor: 799,
      currency: "GBP",
      dedupeKey: membershipMailKey("sub_mail"),
    });
    const { deps, dev } = sendDeps();
    await sendPurchaseEmail(n!, "https://akana.test", deps);
    // A replay of the same invoice: the email is asked for again, the claim stops it.
    const again = await handleStripeEvent(event("invoice.paid", invoice()), repo, m);
    for (const x of again.mail ?? []) await sendPurchaseEmail(x, "https://akana.test", deps);
    expect(dev.sends).toHaveLength(1);
    expect(dev.sends[0]?.text).toContain("£7.99 a month");
  });

  it("asks for nothing on a renewal, a failed first payment or a subscription that is not a membership", async () => {
    const repo = new Purchases(null);
    const renewal = await handleStripeEvent(event("invoice.paid", invoice({ billing_reason: "subscription_cycle" })), repo, membership());
    expect(renewal.mail).toBeUndefined();
    const failed = await handleStripeEvent(event("invoice.payment_failed", invoice()), repo, membership());
    expect(failed.mail).toBeUndefined();
    const org = await handleStripeEvent(event("invoice.paid", invoice()), repo, membership("org_seats"));
    expect(org.mail).toBeUndefined();
  });

  it("uses the invoice address and the yearly wording for an annual member", async () => {
    const out = await handleStripeEvent(event("invoice.paid", invoice({ amount_paid: 6999 })), new Purchases(null), membership("member_year"));
    const n = out.mail?.[0];
    expect(n?.to).toBe("billing@example.test");
    const made = purchaseEmailProps(n!, "https://akana.test", "help@akana.test");
    expect(made?.template).toBe("purchase_membership");
    if (made?.template === "purchase_membership") expect(made.props).toMatchObject({ price: "£69.99", periodWords: "a year" });
  });
});

describe("refund confirmation", () => {
  const charge = (refunded: number) => ({ id: "ch_mail", object: "charge", payment_intent: "pi_mail", amount: 999, amount_refunded: refunded });
  const paid = () => new Purchases({ id: "p1", status: "paid", userId: "u1", sessionId: "cs_mail", pi: "pi_mail" });

  it("asks for refund_confirmed for a dashboard refund, keyed on the refund id", async () => {
    const repo = paid();
    repo.refunds = [{ id: "re_dash", amountMinor: 999, currency: "gbp", status: "succeeded" }];
    const out = await handleStripeEvent(event("charge.refunded", charge(999)), repo);
    expect(out.action).toBe("revoked");
    expect(out.mail).toEqual([
      {
        template: "refund_confirmed",
        to: "sam@example.test",
        name: "Sam Reader",
        userId: "u1",
        refundId: "re_dash",
        amountMinor: 999,
        currency: "GBP",
        accessEnded: true,
        dedupeKey: "refund:re_dash",
      },
    ]);
  });

  it("says access is kept for a partial refund and skips failed refunds", async () => {
    const repo = paid();
    repo.refunds = [
      { id: "re_part", amountMinor: 400, currency: "gbp", status: "succeeded" },
      { id: "re_failed", amountMinor: 100, currency: "gbp", status: "failed" },
    ];
    const out = await handleStripeEvent(event("charge.refunded", charge(400)), repo);
    expect(out.action).toBe("partial_refund_kept");
    expect(out.mail?.map((n) => [n.dedupeKey, (n as Extract<ReaderMailNotice, { template: "refund_confirmed" }>).accessEnded])).toEqual([["refund:re_part", false]]);
  });

  it("asks for nothing for a payment with no single purchase (a membership refund)", async () => {
    const repo = new Purchases(null);
    repo.refunds = [{ id: "re_m", amountMinor: 300, currency: "gbp", status: "succeeded" }];
    const out = await handleStripeEvent(event("charge.refunded", charge(300)), repo);
    expect(out.action).toBe("purchase_not_found");
    expect(out.mail).toBeUndefined();
  });

  it("a console refund and the webhook that follows send one email between them", async () => {
    const { sendRefundConfirmation } = await import("@/lib/support-mail");
    const dev = createDevTransport();
    // The console refunds in Stripe, revokes and emails first.
    const consoleStatus = await sendRefundConfirmation(
      { userId: "u1", refundId: "re_console", amountMinor: 999, currency: "GBP", accessEnded: true },
      { env, transport: dev.transport, origin: "https://akana.test" },
    );
    expect(consoleStatus).toBe("sent_test");
    expect(claims.has(refundMailKey("re_console"))).toBe(true);

    // Then charge.refunded arrives for the same refund.
    const repo = new Purchases({ id: "p1", status: "refunded", userId: "u1", sessionId: "cs_mail", pi: "pi_mail" });
    repo.refunds = [{ id: "re_console", amountMinor: 999, currency: "gbp", status: "succeeded" }];
    const out = await handleStripeEvent(event("charge.refunded", charge(999)), repo);
    expect(out.action).toBe("already_refunded");
    const { deps } = sendDeps();
    const statuses = [];
    for (const n of out.mail ?? []) statuses.push(await sendPurchaseEmail(n, "https://akana.test", { ...deps, transport: dev.transport }));
    expect(statuses).toEqual(["skipped"]);
    expect(dev.sends).toHaveLength(1);
  });

  it("when the webhook gets there first, the console sends nothing", async () => {
    const { sendRefundConfirmation } = await import("@/lib/support-mail");
    const dev = createDevTransport();
    const repo = paid();
    repo.refunds = [{ id: "re_race", amountMinor: 999, currency: "gbp", status: "pending" }];
    const out = await handleStripeEvent(event("charge.refunded", charge(999)), repo);
    const { deps } = sendDeps();
    for (const n of out.mail ?? []) expect(await sendPurchaseEmail(n, "https://akana.test", { ...deps, transport: dev.transport })).toBe("sent_test");
    const consoleStatus = await sendRefundConfirmation(
      { userId: "u1", refundId: "re_race", amountMinor: 999, currency: "GBP", accessEnded: true },
      { env, transport: dev.transport, origin: "https://akana.test" },
    );
    expect(consoleStatus).toBe("skipped");
    expect(dev.sends).toHaveLength(1);
    expect(dev.sends[0]?.text).not.toContain(TITLE);
  });

  it("releases the claim when the send fails, and reports it as an email_failure", async () => {
    const repo = paid();
    repo.refunds = [{ id: "re_fail", amountMinor: 999, currency: "gbp", status: "succeeded" }];
    const out = await handleStripeEvent(event("charge.refunded", charge(999)), repo);
    const report = vi.fn(async () => {});
    const log: SendLogEntry[] = [];
    const status = await sendPurchaseEmail(out.mail![0]!, "https://akana.test", {
      env,
      transport: async () => ({ ok: false, error: "provider down" }),
      claim: (k) => (claims.has(k) ? false : (claims.add(k), true)),
      release: (k) => void claims.delete(k),
      log: withEmailOps("api/stripe/webhook", (e) => void log.push(e), report),
    });
    expect(status).toBe("failed");
    expect(claims.has("refund:re_fail")).toBe(false);
    expect(report).toHaveBeenCalledWith("email_failure", "api/stripe/webhook", "refund_confirmed");
  });
});
