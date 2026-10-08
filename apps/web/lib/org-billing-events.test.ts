import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { handleOrgBillingEvent, type OrgBillingRepo, type OrgSignup } from "@/lib/org-billing-events";
import type { OrgInvoiceArgs, OrgSubscriptionArgs } from "@/lib/org-billing";

const LICENCE = "a0300000-0000-0000-0000-0000000000e1";
const USER = "a0300000-0000-0000-0000-000000000010";

function sub(over: Record<string, unknown> = {}): Stripe.Subscription {
  return {
    id: "sub_T1",
    status: "active",
    customer: "cus_T1",
    collection_method: "send_invoice",
    days_until_due: 30,
    cancel_at_period_end: false,
    livemode: false,
    metadata: { akana_kind: "org_licence", licence_id: LICENCE, plan: "teams_seat_year" },
    items: { data: [{ id: "si_1", quantity: 4, price: { id: "price_x" }, current_period_start: 1780000000, current_period_end: 1811536000 }] },
    ...over,
  } as unknown as Stripe.Subscription;
}

function fakeRepo(opts: { fresh?: Stripe.Subscription | null; provision?: "closed" } = {}) {
  const calls = { apply: [] as OrgSubscriptionArgs[], invoices: [] as OrgInvoiceArgs[], receipts: [] as string[], provisions: [] as OrgSignup[], seats: [] as string[] };
  const repo: OrgBillingRepo = {
    retrieveSubscription: async () => (opts.fresh === undefined ? sub() : opts.fresh),
    apply: async (a) => {
      calls.apply.push(a);
      return "applied";
    },
    recordInvoice: async (a) => {
      calls.invoices.push(a);
      return "recorded";
    },
    recordReceipt: async (id) => {
      calls.receipts.push(id);
      return "recorded";
    },
    provision: async (s) => {
      calls.provisions.push(s);
      return opts.provision ?? { licenceId: LICENCE };
    },
    seatOrganiser: async (licence, user) => {
      calls.seats.push(`${licence}:${user}`);
      return "seat_1";
    },
  };
  return { repo, calls };
}

const event = (type: string, object: unknown, created = 1790000000) =>
  ({ id: "evt_1", type, created, livemode: false, data: { object } }) as unknown as Stripe.Event;

describe("handleOrgBillingEvent", () => {
  it("applies a subscription read fresh from Stripe", async () => {
    const { repo, calls } = fakeRepo();
    const out = await handleOrgBillingEvent(event("customer.subscription.updated", sub({ status: "past_due" })), repo);
    expect(out.action).toBe("subscription_applied");
    expect(calls.apply[0]!.p_status).toBe("active");
    expect(calls.apply[0]!.p_licence).toBe(LICENCE);
    // No tick box, no seat.
    expect(calls.seats).toEqual([]);
  });

  it("seats the organiser only when they ticked the box, after the mirror", async () => {
    const session = {
      id: "cs_2",
      mode: "subscription",
      payment_status: "paid",
      subscription: "sub_SS",
      metadata: { akana_kind: "org_signup", user_id: USER, plan: "group_member_month", org_kind: "community_group", org_name: "Club", quantity: "6", auto_seat: "yes" },
    };
    const { repo, calls } = fakeRepo({ fresh: sub({ id: "sub_SS", metadata: { akana_kind: "org_signup" } }) });
    const out = await handleOrgBillingEvent(event("checkout.session.completed", session), repo);
    expect(out.organiserSeated).toBe(true);
    expect(calls.apply).toHaveLength(1);
    expect(calls.seats).toEqual([`${LICENCE}:${USER}`]);
  });

  it("falls back to the event's copy, dated by the event, when Stripe cannot be read", async () => {
    const { repo, calls } = fakeRepo({ fresh: null });
    await handleOrgBillingEvent(event("customer.subscription.deleted", sub({ status: "canceled" })), repo);
    expect(calls.apply[0]!.p_status).toBe("canceled");
    expect(calls.apply[0]!.p_observed_at).toBe(new Date(1790000000 * 1000).toISOString());
  });

  it("records a paid invoice and makes its pool receipt; a failed one makes none", async () => {
    const inv = {
      id: "in_T1",
      status: "paid",
      currency: "gbp",
      amount_due: 6000,
      amount_paid: 6000,
      total_taxes: [{ amount: 1000 }],
      livemode: false,
      parent: { subscription_details: { subscription: "sub_T1", metadata: { akana_kind: "org_licence" } } },
    };
    const { repo, calls } = fakeRepo();
    const out = await handleOrgBillingEvent(event("invoice.paid", inv), repo);
    expect(out.action).toBe("invoice_recorded");
    expect(out.receipt).toBe("recorded");
    expect(calls.apply).toHaveLength(1);
    expect(calls.receipts).toEqual(["in_T1"]);

    const second = fakeRepo();
    const failed = await handleOrgBillingEvent(event("invoice.payment_failed", { ...inv, status: "open", amount_paid: 0 }), second.repo);
    expect(failed.action).toBe("invoice_recorded");
    expect(second.calls.invoices[0]!.p_payment_failed).toBe(true);
    expect(second.calls.receipts).toEqual([]);
  });

  it("provisions a self-serve sign-up, then links its subscription", async () => {
    const session = {
      id: "cs_1",
      mode: "subscription",
      payment_status: "paid",
      subscription: "sub_SS",
      customer_details: { email: "o@home.example", address: { country: "gb" } },
      metadata: { akana_kind: "org_signup", user_id: USER, plan: "group_member_month", org_kind: "community_group", org_name: "Club", quantity: "6" },
    };
    const { repo, calls } = fakeRepo({ fresh: sub({ id: "sub_SS", metadata: { akana_kind: "org_signup" } }) });
    const out = await handleOrgBillingEvent(event("checkout.session.completed", session), repo);
    expect(out.action).toBe("signup_provisioned");
    expect(calls.provisions[0]).toMatchObject({ userId: USER, plan: "group_member_month", quantity: 6, country: "GB", subscriptionId: "sub_SS" });
    expect(calls.apply[0]!.p_licence).toBe(LICENCE);
  });

  it("does nothing while self-serve is closed, and waits for an unpaid session", async () => {
    const meta = { akana_kind: "org_signup", user_id: USER, plan: "group_member_month", org_kind: "community_group", org_name: "Club", quantity: "6" };
    const closed = fakeRepo({ provision: "closed" });
    const out = await handleOrgBillingEvent(event("checkout.session.completed", { mode: "subscription", payment_status: "paid", subscription: "sub_SS", metadata: meta }), closed.repo);
    expect(out.action).toBe("self_serve_closed");
    expect(closed.calls.apply).toHaveLength(0);

    const waiting = fakeRepo();
    const w = await handleOrgBillingEvent(event("checkout.session.completed", { mode: "subscription", payment_status: "unpaid", subscription: "sub_SS", metadata: meta }), waiting.repo);
    expect(w.action).toBe("signup_awaiting_payment");
    expect(waiting.calls.provisions).toHaveLength(0);
  });

  it("ignores a session without a usable plan and anything else", async () => {
    const { repo, calls } = fakeRepo();
    const out = await handleOrgBillingEvent(
      event("checkout.session.completed", { mode: "subscription", payment_status: "paid", subscription: "sub_SS", metadata: { akana_kind: "org_signup", user_id: USER, plan: "church_band_1", quantity: "1" } }),
      repo,
    );
    expect(out.action).toBe("ignored");
    expect((await handleOrgBillingEvent(event("invoice.upcoming", {}), repo)).action).toBe("ignored");
    expect(calls.provisions).toHaveLength(0);
  });
});
