import { describe, expect, it } from "vitest";
import { cancelInCoolingOff, COOLING_OFF_DAYS, inCoolingOff, proRataRefund, refundCoolingOff } from "@/lib/membership-refund";
import { FakeStripeBilling } from "@/lib/testing/fake-stripe-billing";

/**
 * The cooling-off refund shared by the portal cancel and the deletion job
 * (docs/legal/refund-policy.md section 2). Fake Stripe client, no network.
 */

const DAY = 86_400_000;
const DAY_S = 86_400;
const NOW = new Date("2026-10-07T12:00:00Z");
const T = Math.floor(NOW.getTime() / 1000);
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);
const daysOn = (n: number) => new Date(NOW.getTime() + n * DAY);

describe("proRataRefund", () => {
  it("refunds the unused whole days inside the 14 days, rounded down to the penny", () => {
    const r = proRataRefund({ amountPaid: 799, windowFrom: daysAgo(3), periodStart: daysAgo(3), periodEnd: daysOn(27), now: NOW });
    expect(r).toEqual({ due: true, amountMinor: 719, unusedDays: 27, periodDays: 30 });
  });

  it("works for the annual plan", () => {
    const r = proRataRefund({ amountPaid: 6999, windowFrom: daysAgo(10), periodStart: daysAgo(10), periodEnd: daysOn(355), now: NOW });
    expect(r).toEqual({ due: true, amountMinor: Math.floor((6999 * 355) / 365), unusedDays: 355, periodDays: 365 });
  });

  it("counts a part day as used", () => {
    const r = proRataRefund({ amountPaid: 3000, windowFrom: daysAgo(1), periodStart: daysAgo(1), periodEnd: new Date(NOW.getTime() + 29.5 * DAY), now: NOW });
    expect(r.due && r.unusedDays).toBe(29);
  });

  it("judges the window by when the reader asked, and the days by now", () => {
    // Asked on day 13, processed on day 16: still due, for the days left now.
    const r = proRataRefund({ amountPaid: 799, windowFrom: daysAgo(16), requestedAt: daysAgo(3), periodStart: daysAgo(16), periodEnd: daysOn(14), now: NOW });
    expect(r).toEqual({ due: true, amountMinor: Math.floor((799 * 14) / 30), unusedDays: 14, periodDays: 30 });
  });

  it("is not due after 14 days, for a free invoice, a period already over, or a window in the future", () => {
    expect(COOLING_OFF_DAYS).toBe(14);
    expect(inCoolingOff(daysAgo(14), NOW)).toBe(true);
    expect(inCoolingOff(new Date(NOW.getTime() - 14 * DAY - 1000), NOW)).toBe(false);
    expect(proRataRefund({ amountPaid: 799, windowFrom: daysAgo(15), periodStart: daysAgo(15), periodEnd: daysOn(15), now: NOW })).toEqual({ due: false, reason: "outside_cooling_off" });
    expect(proRataRefund({ amountPaid: 0, windowFrom: daysAgo(1), periodStart: daysAgo(1), periodEnd: daysOn(29), now: NOW }).due).toBe(false);
    expect(proRataRefund({ amountPaid: 799, windowFrom: daysAgo(2), periodStart: daysAgo(31), periodEnd: daysAgo(1), now: NOW }).due).toBe(false);
    expect(proRataRefund({ amountPaid: 799, windowFrom: daysOn(1), periodStart: daysOn(1), periodEnd: daysOn(31), now: NOW }).due).toBe(false);
  });
});

function billing(startedDaysAgo = 3, over: { cancel_at_period_end?: boolean; cancel_at?: number | null; canceled_at?: number | null } = {}) {
  const f = new FakeStripeBilling();
  const start = T - startedDaysAgo * DAY_S;
  f.subs.set("sub_a", {
    id: "sub_a",
    status: "active",
    customer: "cus_a",
    start_date: start,
    interval: "month",
    cancel_at_period_end: true,
    cancel_at: null,
    canceled_at: T - DAY_S,
    ...over,
  });
  f.invoices.push({ id: "in_a1", subscription: "sub_a", amount_paid: 799, currency: "gbp", billing_reason: "subscription_create", paid_at: start, period: { start, end: start + 30 * DAY_S }, payment: { payment_intent: "pi_a1" } });
  return f;
}

describe("refundCoolingOff", () => {
  it("refunds on the payment intent, tagged with the invoice, with an idempotency key per invoice", async () => {
    const f = billing();
    const out = await refundCoolingOff(f.api(), "sub_a", { now: NOW, reason: "cooling_off_cancel" });
    expect(out).toEqual({ status: "refunded", amountMinor: 719, currency: "GBP" });
    expect(f.refunds).toMatchObject([
      { payment_intent: "pi_a1", amount: 719, metadata: { akana_reason: "cooling_off_cancel", akana_refund_invoice: "in_a1" }, idempotencyKey: "akana-cooling-off-refund-in_a1" },
    ]);
  });

  it("refunds once per invoice, whichever path asks", async () => {
    const f = billing();
    await refundCoolingOff(f.api(), "sub_a", { now: NOW, reason: "cooling_off_cancel" });
    expect(await refundCoolingOff(f.api(), "sub_a", { now: NOW, reason: "account_deletion" })).toEqual({ status: "already_refunded" });
    expect(f.refunds).toHaveLength(1);
  });

  it("refunds again only if the earlier refund failed", async () => {
    const f = billing();
    f.refunds.push({ id: "re_x", payment_intent: "pi_a1", amount: 719, status: "failed", metadata: { akana_refund_invoice: "in_a1" } });
    expect((await refundCoolingOff(f.api(), "sub_a", { now: NOW, reason: "cooling_off_cancel" })).status).toBe("refunded");
  });

  it("refunds on the charge when the payment has no payment intent", async () => {
    const f = billing();
    f.invoices[0]!.payment = { charge: "ch_a" };
    await refundCoolingOff(f.api(), "sub_a", { now: NOW, reason: "cooling_off_cancel" });
    expect(f.refunds[0]).toMatchObject({ charge: "ch_a", amount: 719 });
    expect(f.refunds[0]!.payment_intent).toBeUndefined();
  });

  it("refunds nothing with no paid invoice or no payment", async () => {
    const none = billing();
    none.invoices = [];
    expect(await refundCoolingOff(none.api(), "sub_a", { now: NOW, reason: "account_deletion" })).toEqual({ status: "not_due", reason: "no_paid_invoice" });
    const unpaid = billing();
    unpaid.invoices[0]!.payment = null;
    expect(await refundCoolingOff(unpaid.api(), "sub_a", { now: NOW, reason: "account_deletion" })).toEqual({ status: "not_due", reason: "no_payment" });
  });

  it("gives a monthly renewal no window, and a yearly renewal 14 days from its payment", async () => {
    const monthly = billing(60);
    const paid = T - 2 * DAY_S;
    monthly.invoices.push({ id: "in_m2", subscription: "sub_a", amount_paid: 799, currency: "gbp", billing_reason: "subscription_cycle", paid_at: paid, period: { start: paid, end: paid + 30 * DAY_S }, payment: { payment_intent: "pi_m2" } });
    expect(await refundCoolingOff(monthly.api(), "sub_a", { now: NOW, reason: "account_deletion" })).toEqual({ status: "not_due", reason: "outside_cooling_off" });

    const yearly = billing(400);
    yearly.subs.get("sub_a")!.interval = "year";
    yearly.invoices.push({ id: "in_y2", subscription: "sub_a", amount_paid: 6999, currency: "gbp", billing_reason: "subscription_cycle", paid_at: paid, period: { start: paid, end: paid + 365 * DAY_S }, payment: { payment_intent: "pi_y2" } });
    expect(await refundCoolingOff(yearly.api(), "sub_a", { now: NOW, reason: "account_deletion" })).toEqual({
      status: "refunded",
      amountMinor: Math.floor((6999 * 363) / 365),
      currency: "GBP",
    });
  });
});

describe("cancelInCoolingOff (portal cancel)", () => {
  const asked = new Date((T - DAY_S) * 1000);

  it("refunds the unused days, then ends the membership now", async () => {
    const f = billing(3);
    const out = await cancelInCoolingOff(f.api(), "sub_a", { now: NOW, requestedAt: asked });
    expect(out).toEqual({ status: "cancelled", refund: { status: "refunded", amountMinor: 719, currency: "GBP" } });
    expect(f.cancelled).toEqual(["sub_a"]);
    expect(f.subs.get("sub_a")?.status).toBe("canceled");
  });

  it("also acts on a cancel_at date instead of cancel at period end", async () => {
    const f = billing(3, { cancel_at_period_end: false, cancel_at: T + 20 * DAY_S });
    expect((await cancelInCoolingOff(f.api(), "sub_a", { now: NOW, requestedAt: asked })).status).toBe("cancelled");
  });

  it("does nothing extra after 14 days: the membership simply stops renewing", async () => {
    const f = billing(20);
    expect(await cancelInCoolingOff(f.api(), "sub_a", { now: NOW, requestedAt: asked })).toEqual({ status: "outside_cooling_off" });
    expect(f.cancelled).toEqual([]);
    expect(f.refunds).toEqual([]);
  });

  it("does nothing when no cancel was asked for, or the membership has already ended", async () => {
    const live = billing(3, { cancel_at_period_end: false });
    expect(await cancelInCoolingOff(live.api(), "sub_a", { now: NOW, requestedAt: asked })).toEqual({ status: "not_requested" });
    const ended = billing(3);
    ended.subs.get("sub_a")!.status = "canceled";
    expect(await cancelInCoolingOff(ended.api(), "sub_a", { now: NOW, requestedAt: asked })).toEqual({ status: "already_ended" });
    expect([...live.refunds, ...ended.refunds]).toEqual([]);
  });

  it("is idempotent: a failed cancel is retried without a second refund, and a repeat after it ends does nothing", async () => {
    const f = billing(3);
    f.failCancel = true;
    await expect(cancelInCoolingOff(f.api(), "sub_a", { now: NOW, requestedAt: asked })).rejects.toThrow();
    expect(f.refunds).toHaveLength(1);
    f.failCancel = false;
    const retry = await cancelInCoolingOff(f.api(), "sub_a", { now: NOW, requestedAt: asked });
    expect(retry).toEqual({ status: "cancelled", refund: { status: "already_refunded" } });
    expect(await cancelInCoolingOff(f.api(), "sub_a", { now: NOW, requestedAt: asked })).toEqual({ status: "already_ended" });
    expect(f.refunds).toHaveLength(1);
    expect(f.cancelled).toEqual(["sub_a"]);
  });

  it("does not cancel when the refund fails, so the retry does both", async () => {
    const f = billing(3);
    f.failRefund = true;
    await expect(cancelInCoolingOff(f.api(), "sub_a", { now: NOW, requestedAt: asked })).rejects.toThrow();
    expect(f.cancelled).toEqual([]);
    f.failRefund = false;
    expect((await cancelInCoolingOff(f.api(), "sub_a", { now: NOW, requestedAt: asked })).status).toBe("cancelled");
    expect(f.refunds).toHaveLength(1);
  });
});
