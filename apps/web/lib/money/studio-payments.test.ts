import { describe, expect, it } from "vitest";
import {
  channelRate,
  connectHold,
  floorFor,
  isoWeekKey,
  nextMonthlyPayout,
  parseChannel,
  payoutPeriods,
  periodsLabel,
  saleBreakdown,
  shareLabel,
  weeklyCalendar,
} from "@/lib/money/studio-payments";

const schedule = {
  payout_cadence: "weekly" as const,
  payout_weekday: 5,
  payout_day: 15,
  min_payout_minor: { GBP: 1000, USD: 2500 },
  sale_rate_author: "0.5000",
  sale_rate_author_link: "0.7000",
  fee_treatment: "deduct" as const,
  refund_window_days: 14,
  first_payout_hold_days: 30,
  is_placeholder: true,
};

describe("sale breakdown", () => {
  it("lays out price, VAT, fee and the two shares so they add back to the price", () => {
    // 12.00 paid, 2.00 VAT, 0.50 fee: base 9.50, author 50% = 4.75, Akana 4.75
    const b = saleBreakdown({ gross_minor: 1200, tax_minor: 200, fee_minor: 50, author_minor: 475, akana_minor: 475, rate: "0.5000", channel: null });
    expect(b).toMatchObject({ price: 1200, vat: 200, fee: 50, net: 950, author: 475, akana: 475, rate: 0.5, channel: "marketplace", balanced: true });
    expect(b.author + b.akana + b.fee + b.vat).toBe(b.price);
  });

  it("handles no VAT, a fee not yet known and strings from the database", () => {
    const b = saleBreakdown({ gross_minor: "1000", tax_minor: "0", fee_minor: "0", author_minor: "500", akana_minor: "500", rate: null, channel: "author_link" });
    expect(b).toMatchObject({ price: 1000, vat: 0, fee: 0, net: 1000, author: 500, akana: 500, rate: null, channel: "author_link", balanced: true });
  });

  it("balances when Akana carries the fee inside its share", () => {
    // akana_carries: base 1000, author 500, Akana 500, fee 30 recorded but not deducted
    const b = saleBreakdown({ gross_minor: 1200, tax_minor: 200, fee_minor: 30, author_minor: 500, akana_minor: 500 });
    expect(b.balanced).toBe(true);
  });

  it("flags a line whose parts do not add up", () => {
    const b = saleBreakdown({ gross_minor: 1200, tax_minor: 200, fee_minor: 50, author_minor: 475, akana_minor: 400 });
    expect(b.balanced).toBe(false);
  });
});

describe("two-share model by channel", () => {
  it("defaults an unknown or missing channel to marketplace", () => {
    expect(parseChannel(null)).toBe("marketplace");
    expect(parseChannel(undefined)).toBe("marketplace");
    expect(parseChannel("affiliate")).toBe("marketplace");
    expect(parseChannel("author_link")).toBe("author_link");
  });

  it("reads the two rates from the schedule, never a constant", () => {
    expect(channelRate(schedule, "marketplace")).toBe(0.5);
    expect(channelRate(schedule, "author_link")).toBe(0.7);
    expect(channelRate({ sale_rate_author: 0.4, sale_rate_author_link: 0.65 }, "author_link")).toBe(0.65);
  });

  it("labels a placeholder rate as one", () => {
    expect(shareLabel("0.5000", true)).toBe("50% (placeholder)");
    expect(shareLabel(0.625, false)).toBe("62.5%");
  });
});

describe("payout calendar", () => {
  it("pays a Monday to Sunday week on the Friday of the week after, London dates", () => {
    // Friday 9 October 2026, 23:30 UTC is Saturday 00:30 in London, so the sales week is still 5 to 11 October.
    const weeks = weeklyCalendar(new Date("2026-10-09T23:30:00Z"), 5, 2);
    expect(weeks[0]!.weekStart.toISOString().slice(0, 10)).toBe("2026-10-05");
    expect(weeks[0]!.weekEnd.toISOString().slice(0, 10)).toBe("2026-10-11");
    expect(weeks[0]!.payDay.toISOString().slice(0, 10)).toBe("2026-10-16");
    expect(weeks[0]!.sentence).toBe("Sales from 5 October to 11 October are paid on Friday 16 October 2026.");
    expect(weeks[0]!.current).toBe(true);
    expect(weeks[1]!.payDay.toISOString().slice(0, 10)).toBe("2026-10-23");
    expect(weeks[1]!.current).toBe(false);
  });

  it("follows the configured weekday and falls back to Friday for a bad one", () => {
    expect(weeklyCalendar(new Date("2026-10-07T12:00:00Z"), 2, 1)[0]!.payDay.toISOString().slice(0, 10)).toBe("2026-10-13");
    expect(weeklyCalendar(new Date("2026-10-07T12:00:00Z"), 9, 1)[0]!.payDay.toISOString().slice(0, 10)).toBe("2026-10-16");
  });

  it("finds the next monthly payout day", () => {
    expect(nextMonthlyPayout(new Date("2026-10-09T12:00:00Z"), 15).toISOString().slice(0, 10)).toBe("2026-10-15");
    expect(nextMonthlyPayout(new Date("2026-10-16T12:00:00Z"), 15).toISOString().slice(0, 10)).toBe("2026-11-15");
    expect(nextMonthlyPayout(new Date("2026-10-15T12:00:00Z"), 15).toISOString().slice(0, 10)).toBe("2026-10-15");
  });

  it("reads the floor per currency", () => {
    expect(floorFor(schedule, "GBP")).toBe(1000);
    expect(floorFor(schedule, "EUR")).toBeNull();
  });
});

describe("payments report", () => {
  const statements = [
    { period: "2026-06", currency: "GBP", livemode: false, closed_at: "2026-07-15T00:00:00Z" },
    { period: "2026-07", currency: "GBP", livemode: false, closed_at: "2026-08-15T00:00:00Z" },
    { period: "2026-08", currency: "GBP", livemode: false, closed_at: "2026-09-15T00:00:00Z" },
    { period: "2026-08", currency: "USD", livemode: false, closed_at: "2026-09-15T00:00:00Z" },
  ];
  const payouts = [
    { id: "p1", currency: "GBP", livemode: false, amount_minor: "4000", status: "paid" as const, stripe_transfer_id: "tr_1", created_at: "2026-08-16T09:00:00Z", paid_at: "2026-08-16T09:01:00Z" },
    { id: "p2", currency: "GBP", livemode: false, amount_minor: 900, status: "pending" as const, stripe_transfer_id: null, created_at: "2026-09-16T09:00:00Z", paid_at: null },
    { id: "p3", currency: "GBP", livemode: false, amount_minor: 100, status: "failed" as const, stripe_transfer_id: null, created_at: "2026-09-01T09:00:00Z", paid_at: null },
  ];

  it("gives each payout the statement months closed since the one before, and Pending or Paid", () => {
    const rows = payoutPeriods(payouts, statements);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId.p1!.periods).toEqual(["2026-06", "2026-07"]);
    expect(byId.p1!.statusLabel).toBe("Paid");
    expect(byId.p1!.amount_minor).toBe(4000);
    expect(byId.p2!.periods).toEqual(["2026-08"]);
    expect(byId.p2!.statusLabel).toBe("Pending");
    expect(byId.p3!.periods).toEqual([]);
    expect(byId.p3!.statusLabel).toBe("Failed");
  });

  it("writes a period range in words", () => {
    const label = (p: string) => ({ "2026-06": "June 2026", "2026-07": "July 2026", "2026-12": "December 2025" })[p] ?? p;
    expect(periodsLabel([], label)).toBe("");
    expect(periodsLabel(["2026-06"], label)).toBe("June 2026");
    expect(periodsLabel(["2026-06", "2026-07"], label)).toBe("June to July 2026");
    expect(periodsLabel(["2026-12", "2026-07"], label)).toBe("December 2025 to July 2026");
  });
});

describe("connect hold", () => {
  const owed = [{ currency: "GBP", balance_minor: "5045" }];

  it("shows the one step left while money waits on an unverified account", () => {
    const n = connectHold({ connectStatus: "pending", kind: "publisher", isDemo: false, balances: owed });
    expect(n?.step).toContain("Stripe is checking");
    expect(n?.waiting).toEqual([{ currency: "GBP", balance_minor: 5045 }]);
    expect(connectHold({ connectStatus: "not_started", kind: "individual", isDemo: false, balances: owed })?.step).toContain("Connect a payout account");
    expect(connectHold({ connectStatus: "action_needed", kind: "publisher", isDemo: false, balances: owed })?.href).toBe("/payouts");
  });

  it("shows nothing when verified, when nothing is owed, or for Akana house and demo organisations", () => {
    expect(connectHold({ connectStatus: "verified", kind: "publisher", isDemo: false, balances: owed })).toBeNull();
    expect(connectHold({ connectStatus: "pending", kind: "publisher", isDemo: false, balances: [] })).toBeNull();
    expect(connectHold({ connectStatus: "pending", kind: "publisher", isDemo: false, balances: [{ currency: "GBP", balance_minor: 0 }] })).toBeNull();
    expect(connectHold({ connectStatus: "pending", kind: "akana_house", isDemo: false, balances: owed })).toBeNull();
    expect(connectHold({ connectStatus: "pending", kind: "publisher", isDemo: true, balances: owed })).toBeNull();
  });

  it("keys the weekly nudge on the ISO week", () => {
    expect(isoWeekKey(new Date("2026-10-09T12:00:00Z"))).toBe("2026-W41");
    expect(isoWeekKey(new Date("2026-10-11T23:59:00Z"))).toBe("2026-W41");
    expect(isoWeekKey(new Date("2026-10-12T00:00:00Z"))).toBe("2026-W42");
    expect(isoWeekKey(new Date("2027-01-01T12:00:00Z"))).toBe("2026-W53");
  });
});
