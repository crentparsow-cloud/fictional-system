import { describe, expect, it } from "vitest";
import { renderAuthor } from "./author";

const props = {
  studioUrl: "https://example.test/payouts",
  supportEmail: "support@example.test",
  organisationName: "Pay One",
  what: "The bank account for payouts was updated in Stripe.",
  changedAt: "7 October 2026, 18:00",
  payoutsUrl: "https://example.test/payouts",
};

describe("payout_details_changed", () => {
  it("has a fixed subject and says what changed and what to do", () => {
    const r = renderAuthor("payout_details_changed", props);
    expect(r.subject).toBe("Your payout details changed");
    expect(r.text).toContain("Pay One");
    expect(r.text).toContain("bank account for payouts was updated");
    expect(r.text).toContain("support@example.test");
    expect(r.html).toContain("https://example.test/payouts");
  });

  it("uses no em dashes", () => {
    const r = renderAuthor("payout_details_changed", props);
    expect(r.text).not.toContain("—");
    expect(r.subject).not.toContain("—");
  });
});

describe("connect_onboarding_nudge", () => {
  const nudge = {
    studioUrl: "https://example.test/payouts",
    supportEmail: "support@example.test",
    organisationName: "Hold One",
    step: "Connect a payout account through Stripe.",
    waiting: "£50.45",
    payoutsUrl: "https://example.test/payouts",
  };

  it("names the one step and the amount waiting, and no workbook", () => {
    const r = renderAuthor("connect_onboarding_nudge", nudge);
    expect(r.subject).toBe("Your earnings are waiting for one step");
    expect(r.text).toContain("Hold One");
    expect(r.text).toContain("Connect a payout account through Stripe.");
    expect(r.text).toContain("£50.45");
    expect(r.text).toContain("at most once a week");
    expect(r.html).toContain("https://example.test/payouts");
    expect(r.text).not.toContain("—");
  });
});
