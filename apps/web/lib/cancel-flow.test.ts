import { describe, expect, it, vi } from "vitest";
import { CANCEL_REASONS, CANCEL_START, cancelStep, cancelView, chooseOffer, parseCancelForm, pickSubject, type CancelSubject } from "./cancel-flow";
import { runCancelEvent, runStaffCancel, type CancelMailApi, type StripeSubscriptionsApi } from "./membership-cancel";
import type { SharedOffer } from "./shared-membership";

const NOW = new Date("2026-10-14T09:00:00Z");
const sub = (over: Partial<CancelSubject> = {}): CancelSubject => ({
  stripeSubscriptionId: "sub_1",
  plan: "member_month",
  status: "active",
  cancelAtPeriodEnd: false,
  cancelAt: null,
  currentPeriodEnd: "2026-11-06T09:00:00Z",
  pausedFrom: null,
  pausedUntil: null,
  ...over,
});
const OFFER: SharedOffer = { placement: "cancellation", headline: "h", body: "b", cta: "c", href: "/pricing#two-people" };
const fakes = () => {
  const stripe = { update: vi.fn(async () => ({})), cancel: vi.fn(async () => ({})) } satisfies StripeSubscriptionsApi;
  const mail = { paused: vi.fn(async () => null), endedNow: vi.fn(async () => null) } satisfies CancelMailApi;
  return { stripe, mail };
};

describe("cancel view", () => {
  it("covers none, ending and cancellable", () => {
    expect(cancelView(null, NOW).kind).toBe("none");
    expect(cancelView(sub({ cancelAtPeriodEnd: true }), NOW).kind).toBe("ending");
    const v = cancelView(sub(), NOW);
    expect(v).toMatchObject({ kind: "cancellable", plan: "monthly", pausable: true });
  });
  it("picks the most recently updated live subscription", () => {
    const rows = [
      { ...sub({ stripeSubscriptionId: "a" }), updatedAt: "2026-01-01" },
      { ...sub({ stripeSubscriptionId: "b" }), updatedAt: "2026-05-01" },
      { ...sub({ stripeSubscriptionId: "c", status: "canceled" }), updatedAt: "2026-09-01" },
    ];
    expect(pickSubject(rows)?.stripeSubscriptionId).toBe("b");
    expect(pickSubject([])).toBeNull();
  });
});

describe("the one offer", () => {
  const view = cancelView(sub(), NOW);
  it("offers a pause by default", () => {
    expect(chooseOffer({ reason: null, view, sharedOffer: OFFER }).kind).toBe("pause");
  });
  it("offers the shared plan when cost is the reason", () => {
    expect(chooseOffer({ reason: "too_expensive", view, sharedOffer: OFFER }).kind).toBe("shared");
  });
  it("falls back to a pause when the shared plan is not for sale", () => {
    expect(chooseOffer({ reason: "too_expensive", view, sharedOffer: null }).kind).toBe("pause");
  });
  it("offers nothing to someone who cannot pause and has no shared plan", () => {
    const yearly = cancelView(sub({ plan: "member_year" }), NOW);
    expect(chooseOffer({ reason: null, view: yearly, sharedOffer: null }).kind).toBe("none");
  });
  it("never offers the shared plan to someone already on it", () => {
    const two = cancelView(sub({ plan: "member_two_month" }), NOW);
    expect(chooseOffer({ reason: "too_expensive", view: two, sharedOffer: OFFER }).kind).toBe("pause");
  });
});

describe("the state machine", () => {
  const view = cancelView(sub(), NOW) ;
  it("cancels with no reason", () => {
    expect(cancelStep(CANCEL_START, { type: "cancel", reason: null }, view)).toEqual({ step: "cancelled", reason: null });
  });
  it("pauses, stays, and ignores everything once finished", () => {
    expect(cancelStep(CANCEL_START, { type: "pause", months: 2 }, view)).toEqual({ step: "paused", months: 2 });
    expect(cancelStep(CANCEL_START, { type: "stay" }, view)).toEqual({ step: "stayed" });
    const done = cancelStep(CANCEL_START, { type: "cancel", reason: null }, view);
    expect(cancelStep(done, { type: "pause", months: 1 }, view)).toBe(done);
  });
  it("refuses a pause that is not allowed, and any event without a membership", () => {
    const yearly = cancelView(sub({ plan: "member_year" }), NOW);
    expect(cancelStep(CANCEL_START, { type: "pause", months: 1 }, yearly)).toBe(CANCEL_START);
    expect(cancelStep(CANCEL_START, { type: "cancel", reason: null }, { kind: "none" })).toBe(CANCEL_START);
  });
  it("parses the form, keeping only known reasons and months", () => {
    const form = (o: Record<string, string>) => (k: string) => o[k];
    expect(parseCancelForm(form({ intent: "cancel", reason: "unused" }))).toEqual({ type: "cancel", reason: "unused" });
    expect(parseCancelForm(form({ intent: "cancel", reason: "<script>" }))).toEqual({ type: "cancel", reason: null });
    expect(parseCancelForm(form({ intent: "pause-3" }))).toEqual({ type: "pause", months: 3 });
    expect(parseCancelForm(form({ intent: "pause-9" }))).toBeNull();
    expect(parseCancelForm(form({}))).toBeNull();
    expect(CANCEL_REASONS.length).toBe(5);
  });
});

describe("running an event against Stripe", () => {
  it("cancel sets the subscription to end at period end with the reason, and sends no mail itself", async () => {
    const { stripe, mail } = fakes();
    const out = await runCancelEvent({ type: "cancel", reason: "unused" }, sub(), NOW, stripe, mail);
    expect(out).toBe("cancelled");
    expect(stripe.update).toHaveBeenCalledWith("sub_1", { cancel_at_period_end: true, cancellation_details: { feedback: "unused" } });
    expect(mail.endedNow).not.toHaveBeenCalled();
  });
  it("cancel without a reason works", async () => {
    const { stripe, mail } = fakes();
    await runCancelEvent({ type: "cancel", reason: null }, sub(), NOW, stripe, mail);
    expect(stripe.update).toHaveBeenCalledWith("sub_1", { cancel_at_period_end: true });
  });
  it("cancelling a running pause ends it today and emails at once", async () => {
    const { stripe, mail } = fakes();
    const out = await runCancelEvent({ type: "cancel", reason: null }, sub({ pausedFrom: "2026-10-01T00:00:00Z", pausedUntil: "2026-12-01T00:00:00Z" }), NOW, stripe, mail);
    expect(out).toBe("cancelled_now");
    expect(stripe.cancel).toHaveBeenCalled();
    expect(mail.endedNow).toHaveBeenCalledOnce();
  });
  it("cancelling clears a pause that has not started", async () => {
    const { stripe, mail } = fakes();
    await runCancelEvent({ type: "cancel", reason: null }, sub({ pausedFrom: "2026-11-06T09:00:00Z", pausedUntil: "2027-01-06T09:00:00Z" }), NOW, stripe, mail);
    expect(stripe.update).toHaveBeenCalledWith("sub_1", expect.objectContaining({ pause_collection: "", cancel_at_period_end: true }));
  });
  it("pause voids invoices, resumes a day before the first payment and emails", async () => {
    const { stripe, mail } = fakes();
    const out = await runCancelEvent({ type: "pause", months: 2 }, sub(), NOW, stripe, mail);
    expect(out).toBe("paused");
    expect(stripe.update).toHaveBeenCalledWith("sub_1", {
      pause_collection: { behavior: "void", resumes_at: Math.floor(Date.parse("2027-01-05T09:00:00Z") / 1000) },
      metadata: { pause_from: "2026-11-06T09:00:00.000Z", pause_until: "2027-01-06T09:00:00.000Z" },
    });
    expect(mail.paused).toHaveBeenCalledOnce();
  });
  it("does nothing for a yearly pause, an ending membership or no membership", async () => {
    const { stripe, mail } = fakes();
    expect(await runCancelEvent({ type: "pause", months: 1 }, sub({ plan: "member_year" }), NOW, stripe, mail)).toBe("ineligible");
    expect(await runCancelEvent({ type: "cancel", reason: null }, sub({ cancelAtPeriodEnd: true }), NOW, stripe, mail)).toBe("ineligible");
    expect(await runCancelEvent({ type: "cancel", reason: null }, null, NOW, stripe, mail)).toBe("ineligible");
    expect(await runCancelEvent({ type: "stay" }, sub(), NOW, stripe, mail)).toBe("stayed");
    expect(stripe.update).not.toHaveBeenCalled();
    expect(stripe.cancel).not.toHaveBeenCalled();
  });
  it("staff cancel is one call, with the same effect", async () => {
    const { stripe, mail } = fakes();
    expect(await runStaffCancel({ subscription: "sub_1", pausedFrom: null, pausedUntil: null }, NOW, stripe, mail)).toBe("cancelled");
    expect(stripe.update).toHaveBeenCalledOnce();
    expect(await runStaffCancel({ subscription: "sub_1", pausedFrom: "2026-10-01T00:00:00Z", pausedUntil: "2026-12-01T00:00:00Z" }, NOW, stripe, mail)).toBe("cancelled_now");
    expect(mail.endedNow).toHaveBeenCalledOnce();
  });
});
