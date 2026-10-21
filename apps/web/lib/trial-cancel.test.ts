import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { cancelInCoolingOff, coolingOffOpensAt, inCoolingOff } from "@/lib/membership-refund";
import { cancelRequestedInCoolingOff } from "@/lib/stripe-webhook";

const s = (iso: string) => Math.floor(Date.parse(iso) / 1000);
const CREATED = s("2026-10-17T11:50:20Z");
const TRIAL_END = s("2026-10-31T11:50:20Z");
const ASKED = s("2026-10-17T11:51:41Z");

const trialSub = {
  id: "sub_1URW82BLnY1qMMTEBwj0jIOh",
  status: "trialing",
  start_date: CREATED,
  trial_end: TRIAL_END,
  cancel_at_period_end: true,
  cancel_at: null,
  canceled_at: ASKED,
} as unknown as Stripe.Subscription;

describe("trial cancel (staging observation, 17 October 2026)", () => {
  it("window opens at trial end, which is after the request", () => {
    expect(coolingOffOpensAt(trialSub).getTime()).toBe(TRIAL_END * 1000);
    expect(inCoolingOff(coolingOffOpensAt(trialSub), new Date(ASKED * 1000))).toBe(false);
  });
  it("webhook predicate does not fire", () => {
    expect(cancelRequestedInCoolingOff(trialSub, { created: ASKED })).toBe(false);
  });
  it("cancelInCoolingOff never cancels", async () => {
    let cancelled = 0;
    const api = {
      subscriptions: { retrieve: async () => trialSub, cancel: async () => { cancelled++; return { status: "canceled" }; } },
      invoices: { list: async () => ({ data: [] }) },
      invoicePayments: { list: async () => ({ data: [] }) },
      refunds: { create: async () => ({}), list: async () => ({ data: [] }) },
    } as never;
    const out = await cancelInCoolingOff(api, trialSub.id, { now: new Date((ASKED + 2) * 1000), requestedAt: new Date(ASKED * 1000) });
    expect(out.status).toBe("outside_cooling_off");
    expect(cancelled).toBe(0);
  });

  // The observed outcome (DELETE two seconds after the cancel request) is what
  // happens when the window is judged from start_date alone: the request came
  // 81 seconds after the start. A trialing subscription must never reach it,
  // whatever fields the object carries.
  const noTrialEnd = { ...trialSub, trial_end: null } as unknown as Stripe.Subscription;
  const fakeApi = (sub: Stripe.Subscription, calls: string[]) =>
    ({
      subscriptions: { retrieve: async () => sub, cancel: async () => { calls.push("DELETE"); return { status: "canceled" }; } },
      invoices: { list: async () => { calls.push("invoices.list"); return { data: [] }; } },
      invoicePayments: { list: async () => ({ data: [] }) },
      refunds: { create: async () => { calls.push("refund"); return {}; }, list: async () => ({ data: [] }) },
    }) as never;

  it("a trialing subscription without trial_end is not ended or refunded", async () => {
    const calls: string[] = [];
    const out = await cancelInCoolingOff(fakeApi(noTrialEnd, calls), trialSub.id, { now: new Date((ASKED + 2) * 1000), requestedAt: new Date(ASKED * 1000) });
    expect(out.status).toBe("outside_cooling_off");
    expect(calls).toEqual([]);
  });
  it("the webhook predicate does not fire for a trialing subscription without trial_end", () => {
    expect(cancelRequestedInCoolingOff(noTrialEnd, { created: ASKED })).toBe(false);
  });
  it("a paid membership cancelled inside its window still ends now", async () => {
    const paid = { ...trialSub, status: "active", trial_end: null } as unknown as Stripe.Subscription;
    const calls: string[] = [];
    const out = await cancelInCoolingOff(fakeApi(paid, calls), trialSub.id, { now: new Date((ASKED + 2) * 1000), requestedAt: new Date(ASKED * 1000) });
    expect(out.status).toBe("cancelled");
    expect(calls).toContain("DELETE");
    expect(cancelRequestedInCoolingOff(paid, { created: ASKED })).toBe(true);
  });
});
