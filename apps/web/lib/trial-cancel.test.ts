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

/**
 * M11: the cancel page and the webhook count the cooling-off period from the
 * same day. A member who cancels in the 14 days after a trial converts is
 * told what will happen: access ends now, with a pro rata refund.
 */
describe("the cancel page says what the webhook will do (M11)", () => {
  const DAY_S = 86_400;
  const START = 1_790_000_000; // the trial began
  const END = START + 14 * DAY_S; // the trial ended and the first payment was taken
  const row = {
    status: "active",
    startedAt: new Date(START * 1000).toISOString(),
    trialEnd: new Date(END * 1000).toISOString(),
    createdAt: new Date(START * 1000).toISOString(),
  };
  const view = { kind: "cancellable" as const, plan: "monthly" as const, pausable: true, pauseRunning: false, trialing: false, periodEnd: new Date((END + 30 * DAY_S) * 1000).toISOString() };
  const fmt = (iso: string) => iso.slice(0, 10);

  it("five days after the trial converts: both say it ends now with a refund", async () => {
    const { coolingOffForRow, coolingOffCancelApplies } = await import("@/lib/membership-refund");
    const { cancelConsequence } = await import("@/lib/cancel-flow");
    const { cancelRequestedInCoolingOff } = await import("@/lib/stripe-webhook");
    const at = new Date((END + 5 * DAY_S) * 1000);
    // 19 days after the row was created: the old page rule (14 days from created_at) said access carries on.
    expect(at.getTime() - Date.parse(row.createdAt)).toBeGreaterThan(14 * DAY_S * 1000);

    const page = coolingOffForRow(row, at);
    expect(page).toEqual({ applies: true, afterTrial: true });
    const words = cancelConsequence(view, page.applies, fmt, page.afterTrial);
    expect(words).toMatch(/ends today/);
    expect(words).toMatch(/refunded for the days you have not used/);
    expect(words).not.toMatch(/carries on/);

    // The webhook, for the same subscription and the same moment.
    const sub = { status: "active", start_date: START, trial_end: END, cancel_at_period_end: true, cancel_at: null, canceled_at: END + 5 * DAY_S };
    expect(cancelRequestedInCoolingOff(sub as never, { created: END + 5 * DAY_S })).toBe(true);
    expect(coolingOffCancelApplies(sub as never, at)).toBe(page.applies);
  });

  it("agrees with the webhook on every day from the trial to a month after it", async () => {
    const { coolingOffForRow } = await import("@/lib/membership-refund");
    const { cancelRequestedInCoolingOff } = await import("@/lib/stripe-webhook");
    for (let day = 0; day <= 45; day += 1) {
      const t = START + day * DAY_S + 3600;
      const status = t < END ? "trialing" : "active";
      const sub = { status, start_date: START, trial_end: END, cancel_at_period_end: true, cancel_at: null, canceled_at: t };
      const page = coolingOffForRow({ ...row, status }, new Date(t * 1000));
      expect(page.applies, `day ${day}`).toBe(cancelRequestedInCoolingOff(sub as never, { created: t }));
    }
  });

  it("with no trial the window runs from the start, and the words are the ones used before", async () => {
    const { coolingOffForRow } = await import("@/lib/membership-refund");
    const { cancelConsequence } = await import("@/lib/cancel-flow");
    const plain = { status: "active", startedAt: row.startedAt, trialEnd: null, createdAt: row.createdAt };
    expect(coolingOffForRow(plain, new Date((START + 13 * DAY_S) * 1000))).toEqual({ applies: true, afterTrial: false });
    expect(coolingOffForRow(plain, new Date((START + 15 * DAY_S) * 1000))).toEqual({ applies: false, afterTrial: false });
    expect(cancelConsequence(view, true, fmt)).toMatch(/^You started less than 14 days ago/);
    // A row written before 0075 has no started_at: the row's own creation stands in for it.
    expect(coolingOffForRow({ ...plain, startedAt: null }, new Date((START + 13 * DAY_S) * 1000)).applies).toBe(true);
  });

  it("in the trial nothing is refunded and the page says access runs to the trial's end", async () => {
    const { coolingOffForRow } = await import("@/lib/membership-refund");
    expect(coolingOffForRow({ ...row, status: "trialing" }, new Date((START + 3 * DAY_S) * 1000)).applies).toBe(false);
  });

  it("RX-6: a row from before 0075 disagreed with the webhook until its dates were filled in", async () => {
    const { coolingOffForRow } = await import("@/lib/membership-refund");
    const { cancelRequestedInCoolingOff } = await import("@/lib/stripe-webhook");
    const t = END + 5 * DAY_S;
    const sub = { status: "active", start_date: START, trial_end: END, cancel_at_period_end: true, cancel_at: null, canceled_at: t };
    const webhook = cancelRequestedInCoolingOff(sub as never, { created: t });
    expect(webhook).toBe(true);
    // No Stripe event since the deploy: both columns null, so the page fell back to created_at and said no refund.
    const bare = { status: "active", startedAt: null, trialEnd: null, createdAt: row.createdAt };
    expect(coolingOffForRow(bare, new Date(t * 1000)).applies).toBe(false);
    // What app.backfill_subscription_window (0075) writes for that row: the start from the first invoice,
    // the trial end from the period start of the first invoice that took money.
    const filled = { ...bare, startedAt: new Date(START * 1000).toISOString(), trialEnd: new Date(END * 1000).toISOString() };
    for (let day = 0; day <= 45; day += 1) {
      const at = START + day * DAY_S + 3600;
      const status = at < END ? "trialing" : "active";
      const live = { ...sub, status, canceled_at: at };
      expect(coolingOffForRow({ ...filled, status }, new Date(at * 1000)).applies, `day ${day}`).toBe(cancelRequestedInCoolingOff(live as never, { created: at }));
    }
  });
});
