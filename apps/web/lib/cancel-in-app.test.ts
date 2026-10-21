import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { runCancelEvent, type CancelMailApi, type StripeSubscriptionsApi } from "./membership-cancel";
import type { CancelSubject } from "./cancel-flow";

/**
 * R9: cancellation completes inside Akana in two taps, ends the plan at the
 * period end through the Stripe API, and never sends the reader to the
 * billing portal. The portal stays for card updates.
 */

const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const NOW = new Date("2026-10-14T09:00:00Z");
const subject: CancelSubject = {
  stripeSubscriptionId: "sub_live",
  plan: "member_year",
  status: "active",
  cancelAtPeriodEnd: false,
  cancelAt: null,
  currentPeriodEnd: "2027-06-01T00:00:00Z",
  pausedFrom: null,
  pausedUntil: null,
};

describe("cancel at period end through the Stripe API", () => {
  it("calls subscriptions.update with cancel_at_period_end and never ends the plan now", async () => {
    const stripe = { update: vi.fn(async () => ({})), cancel: vi.fn(async () => ({})) } satisfies StripeSubscriptionsApi;
    const mail = { paused: vi.fn(async () => null), endedNow: vi.fn(async () => null) } satisfies CancelMailApi;
    const out = await runCancelEvent({ type: "cancel", reason: null }, subject, NOW, stripe, mail);
    expect(out).toBe("cancelled");
    expect(stripe.update).toHaveBeenCalledTimes(1);
    expect(stripe.update).toHaveBeenCalledWith("sub_live", { cancel_at_period_end: true });
    expect(stripe.cancel).not.toHaveBeenCalled();
  });

  it("changes nothing when the plan is already set to end", async () => {
    const stripe = { update: vi.fn(async () => ({})), cancel: vi.fn(async () => ({})) };
    const mail = { paused: vi.fn(async () => null), endedNow: vi.fn(async () => null) };
    const out = await runCancelEvent({ type: "cancel", reason: null }, { ...subject, cancelAtPeriodEnd: true }, NOW, stripe, mail);
    expect(out).toBe("ineligible");
    expect(stripe.update).not.toHaveBeenCalled();
  });
});

describe("two taps from You", () => {
  const you = src("../app/(reader)/you/page.tsx");
  it("You links straight to the in-app cancel screen", () => {
    expect(you).toContain('href="/you/membership/cancel"');
    expect(you).toMatch(/Cancel membership/);
  });
  it("the portal form on You is for the card, not for cancelling", () => {
    const at = you.indexOf('action="/api/billing/portal"');
    const form = you.slice(at, you.indexOf("</form>", at));
    expect(form).toContain("Update your card");
    expect(form).not.toMatch(/cancel/i);
  });
  it("the cancel action uses the Stripe subscriptions API and not the portal", () => {
    const action = src("../app/(reader)/you/membership/cancel/actions.ts");
    expect(action).toContain("runCancelEvent");
    expect(action).not.toMatch(/billingPortal|billing\/portal/);
    const page = src("../app/(reader)/you/membership/cancel/page.tsx");
    expect(page).not.toMatch(/billing\/portal|billingPortal/);
  });
  it("the cancel screen is one step: a single form posts to the action", () => {
    const form = src("../app/(reader)/you/membership/cancel/CancelForm.tsx");
    expect(form).toContain("action={submitCancel}");
  });
});
