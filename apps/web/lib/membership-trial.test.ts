import { describe, expect, it } from "vitest";
import {
  TRIAL_DEFAULT_DAYS,
  TRIAL_REMINDER_LEAD_DAYS,
  daysWords,
  parseTrialDays,
  trialCheckoutNotice,
  trialConfigFrom,
  trialDateLines,
  trialDates,
  trialEligible,
  trialLabel,
  ukDateWords,
} from "@/lib/membership-trial";

const START = new Date("2026-10-10T10:30:00Z");

describe("trial lengths (13.5)", () => {
  it("default to 14 days monthly and 21 days annual", () => {
    expect(TRIAL_DEFAULT_DAYS).toEqual({ monthly: 14, yearly: 21 });
    expect(trialConfigFrom([])).toEqual({ monthly: 14, yearly: 21 });
    expect(trialConfigFrom(null)).toEqual({ monthly: 14, yearly: 21 });
  });

  it("read the settings from app_config rows, as numbers or numeric strings", () => {
    expect(trialConfigFrom([{ key: "membership_trial_days_monthly", value: 10 }, { key: "membership_trial_days_yearly", value: "30" }])).toEqual({ monthly: 10, yearly: 30 });
  });

  it("let 0 switch the trial off and refuse nonsense", () => {
    expect(parseTrialDays(0, 14)).toBe(0);
    expect(parseTrialDays(-1, 14)).toBe(14);
    expect(parseTrialDays(1.5, 14)).toBe(14);
    expect(parseTrialDays(61, 14)).toBe(14);
    expect(parseTrialDays("abc", 14)).toBe(14);
    expect(parseTrialDays("", 14)).toBe(14);
    expect(parseTrialDays(null, 21)).toBe(21);
  });
});

describe("trial date maths (13.5)", () => {
  it("ends 14 days after it starts and reminds three days before", () => {
    const d = trialDates(START, 14)!;
    expect(d.trialEndsAt.toISOString()).toBe("2026-10-24T10:30:00.000Z");
    expect(d.reminderAt.toISOString()).toBe("2026-10-21T10:30:00.000Z");
    expect(TRIAL_REMINDER_LEAD_DAYS).toBe(3);
  });

  it("ends 21 days after it starts on the annual plan", () => {
    const d = trialDates(START, 21)!;
    expect(d.trialEndsAt.toISOString()).toBe("2026-10-31T10:30:00.000Z");
    expect(d.reminderAt.toISOString()).toBe("2026-10-28T10:30:00.000Z");
  });

  it("never puts the reminder before the trial starts", () => {
    const d = trialDates(START, 2)!;
    expect(d.reminderAt.getTime()).toBe(START.getTime());
    expect(trialDates(START, 3)!.reminderAt.getTime()).toBe(START.getTime());
  });

  it("gives nothing for no trial", () => {
    expect(trialDates(START, 0)).toBeNull();
    expect(trialDates(START, -3)).toBeNull();
    expect(trialDateLines(START, 0)).toBeNull();
  });

  it("carries across a month end and a year end", () => {
    const d = trialDates(new Date("2026-12-25T09:00:00Z"), 14)!;
    expect(d.trialEndsAt.toISOString()).toBe("2027-01-08T09:00:00.000Z");
    expect(d.reminderAt.toISOString()).toBe("2027-01-05T09:00:00.000Z");
  });

  it("writes the dates in UK time, including across the clocks going back", () => {
    expect(ukDateWords(new Date("2026-10-24T10:30:00Z"))).toBe("24 October 2026");
    // 23:30 UTC in July is 00:30 the next day in London (summer time); in December the two agree.
    expect(ukDateWords(new Date("2026-07-01T23:30:00Z"))).toBe("2 July 2026");
    expect(ukDateWords(new Date("2026-12-01T23:30:00Z"))).toBe("1 December 2026");
  });

  it("states the reminder date and the first payment date in words", () => {
    const lines = trialDateLines(START, 14)!;
    expect(lines).toEqual({ days: "14 days", reminder: "21 October 2026", trialEnds: "24 October 2026", firstPayment: "24 October 2026" });
  });
});

describe("trial labels (5.3)", () => {
  it("reads '14 days, then £7.99 a month' and never says free", () => {
    expect(trialLabel("monthly", 14, "£7.99")).toBe("14 days, then £7.99 a month");
    expect(trialLabel("yearly", 21, "£69.99")).toBe("21 days, then £69.99 a year");
    expect(trialLabel("monthly", 14, "£7.99")).not.toMatch(/free/i);
  });

  it("shows only the price when there is no trial", () => {
    expect(trialLabel("monthly", 0, "£7.99")).toBe("£7.99 a month");
  });

  it("uses the singular for one day", () => {
    expect(daysWords(1)).toBe("1 day");
    expect(trialLabel("monthly", 1, "£7.99")).toBe("1 day, then £7.99 a month");
  });
});

describe("checkout notice (13.5)", () => {
  it("states the first payment date, the amount, the reminder date and the cancel path", () => {
    const text = trialCheckoutNotice("monthly", 14, "£7.99", START)!;
    expect(text).toContain("Your trial lasts 14 days.");
    expect(text).toContain("Nothing is taken today.");
    expect(text).toContain("On 24 October 2026 we take £7.99");
    expect(text).toContain("We email you a reminder on 21 October 2026.");
    expect(text).toContain("go to the You page, then Manage membership");
    expect(text).toContain("If you cancel before 24 October 2026, you are not charged.");
    expect(text).not.toMatch(/free|—|–/i);
  });

  it("says each year for the annual plan", () => {
    expect(trialCheckoutNotice("yearly", 21, "£69.99", START)).toContain("£69.99 each year until you cancel");
  });

  it("is null when there is no trial", () => {
    expect(trialCheckoutNotice("monthly", 0, "£7.99", START)).toBeNull();
  });

  it("fits in Stripe's 1200 character limit for custom text with the renewal notice", () => {
    const text = trialCheckoutNotice("yearly", 21, "£1,069.99", START)!;
    expect(text.length).toBeLessThan(700);
  });
});

describe("one trial per reader", () => {
  it("is for readers with no earlier subscription of any status", () => {
    expect(trialEligible(0)).toBe(true);
    expect(trialEligible(1)).toBe(false);
  });
});
