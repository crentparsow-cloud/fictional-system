import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import {
  BILLING_NOTICES,
  billingErrorNotice,
  billingStateText,
  endedSeatText,
  invoicesCsv,
  isOrgBillingEvent,
  joinLinkUrl,
  linkClaimErrorCode,
  LINK_CLAIM_ERRORS,
  orgInvoiceArgs,
  orgPlanForPrice,
  orgPriceId,
  orgSubscriptionArgs,
  parseInviteCsv,
  parseInviteList,
  parseJoinLinkForm,
  parseSignupForm,
  plansForLicenceKind,
  rosterCsv,
  seatSummaryCsv,
} from "@/lib/org-billing";

const ENV = { STRIPE_PRICE_ORG_SEAT_YEARLY: "price_seatyear", STRIPE_PRICE_ORG_GROUP_MEMBER_MONTHLY: "price_group" };
const LICENCE = "a0300000-0000-0000-0000-0000000000e1";

function sub(over: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
  return {
    id: "sub_T1",
    object: "subscription",
    status: "active",
    customer: "cus_T1",
    collection_method: "send_invoice",
    days_until_due: 30,
    cancel_at_period_end: false,
    cancel_at: null,
    canceled_at: null,
    ended_at: null,
    livemode: false,
    metadata: { akana_kind: "org_licence", licence_id: LICENCE },
    items: { object: "list", data: [{ id: "si_1", quantity: 12, price: { id: "price_seatyear" }, current_period_start: 1780000000, current_period_end: 1811536000 }] },
    ...over,
  } as unknown as Stripe.Subscription;
}

describe("plans and prices", () => {
  it("reads price ids from env and says nothing for a missing one", () => {
    expect(orgPriceId("teams_seat_year", ENV)).toBe("price_seatyear");
    expect(orgPriceId("teams_seat_month", ENV)).toBeNull();
    expect(orgPriceId("teams_seat_month", { STRIPE_PRICE_ORG_SEAT_MONTHLY: "not a price" })).toBeNull();
    expect(orgPlanForPrice("price_group", ENV)).toBe("group_member_month");
    expect(orgPlanForPrice("price_other", ENV)).toBeNull();
  });
  it("lists plans for a licence kind with whether each is priced", () => {
    const teams = plansForLicenceKind("teams", ENV);
    expect(teams.map((p) => [p.plan.id, p.priced])).toEqual([
      ["teams_seat_month", false],
      ["teams_seat_year", true],
    ]);
    expect(plansForLicenceKind("pilot", ENV)).toEqual([]);
  });
});

describe("isOrgBillingEvent", () => {
  const ev = (type: string, object: unknown) => ({ type, data: { object } }) as unknown as Stripe.Event;
  it("takes organisation subscriptions, invoices and sign-up sessions", () => {
    expect(isOrgBillingEvent(ev("customer.subscription.updated", sub()))).toBe(true);
    expect(isOrgBillingEvent(ev("invoice.paid", { parent: { subscription_details: { subscription: "sub_T1", metadata: { akana_kind: "org_licence" } } } }))).toBe(true);
    expect(isOrgBillingEvent(ev("checkout.session.completed", { metadata: { akana_kind: "org_signup" } }))).toBe(true);
  });
  it("leaves reader memberships, refunds and disputes alone", () => {
    expect(isOrgBillingEvent(ev("customer.subscription.updated", sub({ metadata: { user_id: "x" } })))).toBe(false);
    expect(isOrgBillingEvent(ev("invoice.paid", { parent: { subscription_details: { subscription: "sub_M", metadata: {} } } }))).toBe(false);
    expect(isOrgBillingEvent(ev("checkout.session.completed", { metadata: { workbook_id: "w" } }))).toBe(false);
    expect(isOrgBillingEvent(ev("charge.refunded", { metadata: { akana_kind: "org_licence" } }))).toBe(false);
  });
});

describe("orgSubscriptionArgs", () => {
  it("maps a subscription to the 0030 arguments", () => {
    const a = orgSubscriptionArgs(sub(), new Date("2026-10-08T10:00:00Z"), ENV)!;
    expect(a).toMatchObject({
      p_subscription: "sub_T1",
      p_customer: "cus_T1",
      p_licence: LICENCE,
      p_status: "active",
      p_plan: "teams_seat_year",
      p_price: "price_seatyear",
      p_quantity: 12,
      p_collection: "send_invoice",
      p_days_until_due: 30,
      p_livemode: false,
      p_observed_at: "2026-10-08T10:00:00.000Z",
    });
    expect(a.p_period_end).toBe(new Date(1811536000 * 1000).toISOString());
  });
  it("prefers the plan in metadata and refuses a bad id", () => {
    expect(orgSubscriptionArgs(sub({ metadata: { akana_kind: "org_licence", plan: "group_member_month" } }), new Date(), ENV)!.p_plan).toBe("group_member_month");
    expect(orgSubscriptionArgs(sub({ id: "bad" }), new Date(), ENV)).toBeNull();
    expect(orgSubscriptionArgs(sub({ status: "weird" as Stripe.Subscription.Status }), new Date(), ENV)).toBeNull();
    expect(orgSubscriptionArgs(sub({ metadata: { licence_id: "not-a-uuid" } }), new Date(), ENV)!.p_licence).toBeNull();
  });
});

describe("orgInvoiceArgs", () => {
  it("maps amounts, VAT, the PO number and the dates", () => {
    const inv = {
      id: "in_T1",
      number: "AK-0001",
      status: "paid",
      currency: "gbp",
      amount_due: 6000,
      amount_paid: 6000,
      total_taxes: [{ amount: 1000 }],
      custom_fields: [{ name: "PO number", value: "PO 7" }],
      collection_method: "send_invoice",
      billing_reason: "subscription_create",
      due_date: 1780000000,
      status_transitions: { paid_at: 1780100000 },
      hosted_invoice_url: "https://invoice.stripe.com/i/x",
      invoice_pdf: null,
      livemode: false,
      parent: { subscription_details: { subscription: "sub_T1", metadata: { akana_kind: "org_licence" } } },
    } as unknown as Stripe.Invoice;
    const a = orgInvoiceArgs(inv, new Date("2026-10-08T00:00:00Z"), false)!;
    expect(a).toMatchObject({ p_invoice: "in_T1", p_subscription: "sub_T1", p_currency: "GBP", p_tax: 1000, p_po: "PO 7", p_status: "paid" });
    expect(a.p_paid_at).toBe(new Date(1780100000 * 1000).toISOString());
    expect(orgInvoiceArgs({ ...inv, parent: null } as unknown as Stripe.Invoice, new Date(), false)).toBeNull();
  });
});

describe("parseInviteCsv", () => {
  it("takes one address per row, skips a header, counts repeats and bad rows", () => {
    const r = parseInviteCsv("﻿Email,Name\namy@work.example,Amy\nAMY@work.example\n\"ben@work.example\";Ben\nnot an email\n,\n");
    expect(r.valid).toEqual(["amy@work.example", "ben@work.example"]);
    expect(r.duplicates).toBe(1);
    expect(r.invalid).toEqual([
      { line: 5, value: "not an email" },
      { line: 6, value: "" },
    ]);
    expect(r.truncated).toBe(false);
  });
  it("stops at the row limit", () => {
    const text = Array.from({ length: 5 }, (_, i) => `p${i}@x.example`).join("\n");
    const r = parseInviteCsv(text, 3);
    expect(r.valid).toHaveLength(3);
    expect(r.truncated).toBe(true);
  });
  it("re-checks the list carried to the send", () => {
    expect(parseInviteList("a@x.example\nb@x.example\na@x.example")).toEqual(["a@x.example", "b@x.example"]);
    expect(parseInviteList("a@x.example\nnope")).toBeNull();
    expect(parseInviteList("")).toBeNull();
  });
});

describe("join links", () => {
  const get = (o: Record<string, string>) => (k: string) => o[k];
  it("parses days, cap and domain within the seats", () => {
    expect(parseJoinLinkForm(get({ days: "14", max_uses: "5", domain: "@Work.Example" }), 10)).toEqual({ days: 14, maxUses: 5, domain: "work.example" });
    expect(parseJoinLinkForm(get({ days: "14", max_uses: "5", domain: "" }), 10)!.domain).toBeNull();
    expect(parseJoinLinkForm(get({ days: "0", max_uses: "5" }), 10)).toBeNull();
    expect(parseJoinLinkForm(get({ days: "91", max_uses: "5" }), 10)).toBeNull();
    expect(parseJoinLinkForm(get({ days: "5", max_uses: "11" }), 10)).toBeNull();
    expect(parseJoinLinkForm(get({ days: "5", max_uses: "2", domain: "bad domain" }), 10)).toBeNull();
  });
  it("maps claim errors to fixed codes with copy", () => {
    for (const [code, key] of [
      ["AKO11", "domain"],
      ["AKO12", "full"],
      ["AKO10", "adult"],
      ["AKO29", "busy"],
      ["XX", "failed"],
    ] as const) {
      expect(linkClaimErrorCode(code)).toBe(key);
      expect(LINK_CLAIM_ERRORS[key]).toBeTruthy();
    }
    expect(joinLinkUrl("https://akana.example", "tok")).toBe("https://akana.example/org/link/tok");
  });
});

describe("wording", () => {
  const fmt = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
  const base = { licenceStatus: "active", billingState: "active", graceUntil: null, endRequested: false, cancelAtPeriodEnd: false, periodEnd: "2027-06-01T00:00:00Z", endsAt: "2027-06-03T00:00:00Z" };
  it("says where billing stands without a price", () => {
    expect(billingStateText(base, fmt)).toBe("Paid up. Renews on 2027-06-01.");
    expect(billingStateText({ ...base, billingState: "past_due", graceUntil: "2026-10-22T00:00:00Z" }, fmt)).toContain("until 2026-10-22");
    expect(billingStateText({ ...base, billingState: "unpaid" }, fmt)).toContain("paused");
    expect(billingStateText({ ...base, endRequested: true }, fmt)).toContain("Ending");
    expect(billingStateText({ ...base, licenceStatus: "ended" }, fmt)).toBe("This licence has ended.");
    expect(billingStateText({ ...base, billingState: null }, fmt)).toContain("invoice");
    for (const n of Object.values(BILLING_NOTICES)) expect(n.text).not.toMatch(/[£$€]\s?\d/);
  });
  it("tells the member their work is still theirs, without a title", () => {
    const t = endedSeatText("Biz", "8 October 2026");
    expect(t).toContain("still yours");
    expect(t).toContain("read it");
  });
  it("maps database errors", () => {
    expect(billingErrorNotice("AKO01")).toBe("denied");
    expect(billingErrorNotice("AKO14")).toBe("state");
    expect(billingErrorNotice(undefined)).toBe("failed");
  });
});

describe("signup form", () => {
  const get = (o: Record<string, string>) => (k: string) => o[k];
  const ok = { plan: "group_member_month", org_kind: "community_group", name: "Book Club", quantity: "6", adult: "yes", renews: "yes" };
  it("needs the 18+ tick, the renewal tick and bounds for the plan", () => {
    expect(parseSignupForm(get(ok))).toEqual({ plan: "group_member_month", orgKind: "community_group", name: "Book Club", quantity: 6, autoSeat: false });
    expect(parseSignupForm(get({ ...ok, auto_seat: "yes" }))?.autoSeat).toBe(true);
    expect(parseSignupForm(get({ ...ok, adult: "" }))).toBeNull();
    expect(parseSignupForm(get({ ...ok, renews: "" }))).toBeNull();
    expect(parseSignupForm(get({ ...ok, quantity: "3" }))).toBeNull();
    expect(parseSignupForm(get({ ...ok, quantity: "16" }))).toBeNull();
    expect(parseSignupForm(get({ ...ok, org_kind: "business" }))).toBeNull();
    expect(parseSignupForm(get({ ...ok, plan: "teams_seat_month", org_kind: "church" }))).toBeNull();
    expect(parseSignupForm(get({ ...ok, plan: "church_band_1" }))).toBeNull();
  });
});

describe("export CSVs", () => {
  it("roster: addresses and dates only", () => {
    const csv = rosterCsv([
      { licence_kind: "teams", licence_starts_at: "2026-05-01T00:00:00Z", licence_ends_at: "2027-05-01T00:00:00Z", roster_email: "amy@w.example", joined_by: "invitation", claimed_at: "2026-06-02T00:00:00Z", released_at: null, released_reason: null },
      { licence_kind: "teams", licence_starts_at: "2026-05-01T00:00:00Z", licence_ends_at: "2027-05-01T00:00:00Z", roster_email: null, joined_by: "link", claimed_at: "2026-06-02T00:00:00Z", released_at: "2026-07-01T00:00:00Z", released_reason: "left" },
    ]);
    expect(csv.split("\r\n")[0]).toBe("licence,licence_starts,licence_ends,email,joined_by,seat_taken,seat_released,released_reason");
    expect(csv).toContain("amy@w.example,invitation,2026-06-02");
    expect(csv).toContain("joined with a link,link,2026-06-02,2026-07-01,left");
  });
  it("invoices in plain amounts; seat counts keep suppression", () => {
    const inv = invoicesCsv([
      { number: "AK-1", status: "paid", currency: "GBP", amount_due_minor: 6000, amount_paid_minor: 6000, tax_minor: 1000, po_number: "=cmd", period_start: null, period_end: null, due_at: null, paid_at: "2026-06-10T00:00:00Z", livemode: false },
    ]);
    expect(inv).toContain("AK-1,paid,GBP,60.00,60.00,10.00,'=cmd");
    const seats = seatSummaryCsv([
      { kind: "teams", status: "active", starts_at: "2026-05-01", ends_at: "2027-05-01", seats_purchased: 10, seats_claimed: 3, invitations_open: 1, people_started: null, started_shown: "fewer_than", threshold: 5 },
    ]);
    expect(seats).toContain("fewer than 5 or not shown");
  });
});
