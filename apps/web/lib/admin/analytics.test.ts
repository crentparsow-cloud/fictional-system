import { describe, expect, it } from "vitest";
import { countFunnelEvent, membershipFunnelEvent } from "@/lib/funnel";
import { dailyVisitorHash, utcDay, visitorHashFor, visitorSalt, visitorSubject } from "@/lib/visitor-id";
import { cohortTable, dropOffByUnit, funnelSteps, membershipMetrics, parseWeeks, suppressed } from "./analytics";

const headers = (h: Record<string, string>) => new Headers(h);

describe("daily visitor id", () => {
  it("is a sha256 hex digest that changes with the day and the salt, and never contains the subject", () => {
    const a = dailyVisitorHash({ salt: "s", day: "2026-10-09", subject: "user:abc" });
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(dailyVisitorHash({ salt: "s", day: "2026-10-09", subject: "user:abc" })).toBe(a);
    expect(dailyVisitorHash({ salt: "s", day: "2026-10-10", subject: "user:abc" })).not.toBe(a);
    expect(dailyVisitorHash({ salt: "t", day: "2026-10-09", subject: "user:abc" })).not.toBe(a);
    expect(dailyVisitorHash({ salt: "s", day: "2026-10-09", subject: "user:abd" })).not.toBe(a);
    expect(a.includes("abc")).toBe(false);
  });

  it("prefers the user id, falls back to address and agent, and gives null with nothing to go on", () => {
    expect(visitorSubject(headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1", "user-agent": "UA" }), "u1")).toBe("user:u1");
    expect(visitorSubject(headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1", "user-agent": "UA" }))).toBe("visitor:1.2.3.4|UA");
    expect(visitorSubject(headers({}))).toBeNull();
    expect(visitorSubject(null)).toBeNull();
    expect(visitorSubject(null, "u1")).toBe("user:u1");
  });

  it("rotates at UTC midnight", () => {
    const h = headers({ "user-agent": "UA", "x-real-ip": "9.9.9.9" });
    const env = { LEAD_HASH_SALT: "salt" };
    const late = visitorHashFor(h, null, new Date("2026-10-09T23:59:59Z"), env);
    const early = visitorHashFor(h, null, new Date("2026-10-10T00:00:01Z"), env);
    expect(late).not.toBe(early);
    expect(utcDay(new Date("2026-10-09T23:59:59Z"))).toBe("2026-10-09");
  });

  it("uses a development salt outside production and refuses in production without one", () => {
    expect(visitorSalt({ NODE_ENV: "test" })).toBeTruthy();
    expect(visitorSalt({ LEAD_HASH_SALT: "x", NODE_ENV: "production" })).toBe("x");
    expect(() => visitorSalt({ NODE_ENV: "production" })).toThrow();
  });

  it("sends the hash and the unit with a count, and only ids otherwise", async () => {
    const calls: Record<string, unknown>[] = [];
    const client = { rpc: async (_fn: string, args: Record<string, unknown>) => (calls.push(args), { error: null }) };
    await countFunnelEvent(client, "field_answered", { tenantId: "t", workbookId: "w", unit: 3, headers: headers({ "user-agent": "UA", "x-real-ip": "1.1.1.1" }), userId: "u" });
    expect(calls[0]?.p_unit).toBe(3);
    expect(calls[0]?.p_visitor).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(calls[0])).not.toContain("u\"");
    expect(JSON.stringify(calls[0])).not.toContain("1.1.1.1");
    await countFunnelEvent(client, "purchase", { tenantId: "t", headers: null });
    expect(calls[1]).toEqual({ p_event: "purchase", p_tenant: "t", p_workbook: null });
    await countFunnelEvent(client, "step_finished", { tenantId: "t", unit: 0, headers: null });
    expect(calls[2]?.p_unit).toBeUndefined();
  });
});

describe("membership events from Stripe", () => {
  const sub = (type: string, object: Record<string, unknown>, previous_attributes?: Record<string, unknown>) =>
    ({ type, data: { object, previous_attributes } }) as Parameters<typeof membershipFunnelEvent>[0];

  it("counts a trial start, a trial cancel and a paid cancel once each", () => {
    expect(membershipFunnelEvent(sub("customer.subscription.created", { status: "trialing" }))).toBe("trial_started");
    expect(membershipFunnelEvent(sub("customer.subscription.created", { status: "active" }))).toBeNull();
    expect(membershipFunnelEvent(sub("customer.subscription.updated", { status: "trialing", cancel_at_period_end: true }, { cancel_at_period_end: false }))).toBe("trial_cancelled");
    expect(membershipFunnelEvent(sub("customer.subscription.updated", { status: "active", cancel_at_period_end: true }, { cancel_at_period_end: false }))).toBe("membership_cancelled");
    expect(membershipFunnelEvent(sub("customer.subscription.updated", { status: "canceled" }, { status: "active" }))).toBe("membership_cancelled");
    // An update that does not touch the cancel fields is not a cancel.
    expect(membershipFunnelEvent(sub("customer.subscription.updated", { status: "active", cancel_at_period_end: true }, { current_period_end: 1 }))).toBeNull();
    // The end of a cancel asked for earlier is not a second cancel.
    expect(membershipFunnelEvent(sub("customer.subscription.deleted", { status: "canceled", cancel_at_period_end: true }))).toBeNull();
    // An immediate cancel with no earlier request is one cancel.
    expect(membershipFunnelEvent(sub("customer.subscription.deleted", { status: "canceled", cancel_at_period_end: false }))).toBe("membership_cancelled");
    expect(membershipFunnelEvent(sub("invoice.paid", { status: "active" }))).toBeNull();
  });
});

describe("analytics shaping", () => {
  it("builds the funnel from page view to completed checkout with shares of the first step", () => {
    const steps = funnelSteps([
      { event: "page_view", workbook_id: null, workbook_code: null, unit: null, n: 300, uniques: 200 },
      { event: "page_view", workbook_id: "w", workbook_code: "AK-AAAAA", unit: null, n: 100, uniques: 50 },
      { event: "free_week_started", workbook_id: "w", workbook_code: "AK-AAAAA", unit: null, n: 60, uniques: 50 },
      { event: "purchase", workbook_id: "w", workbook_code: "AK-AAAAA", unit: null, n: 25, uniques: 25 },
      { event: "field_answered", workbook_id: "w", workbook_code: "AK-AAAAA", unit: 1, n: 999, uniques: 10 },
    ]);
    expect(steps.map((s) => s.event)).toEqual(["page_view", "sample_view", "free_week_started", "checkout_started", "purchase"]);
    expect(steps[0]).toMatchObject({ n: 400, uniques: 250, shareOfFirst: 100 });
    expect(steps[2]).toMatchObject({ n: 60, uniques: 50, shareOfFirst: 20 });
    expect(steps[4]).toMatchObject({ uniques: 25, shareOfFirst: 10 });
    expect(steps[1]).toMatchObject({ n: 0, uniques: 0, shareOfFirst: 0 });
    expect(funnelSteps([])[0]?.shareOfFirst).toBeNull();
  });

  it("shows fields answered against steps finished per unit, suppressed below 5", () => {
    const d = dropOffByUnit([
      { event: "field_answered", workbook_id: "w", workbook_code: "AK-AAAAA", unit: 1, n: 40, uniques: 9 },
      { event: "step_finished", workbook_id: "w", workbook_code: "AK-AAAAA", unit: 1, n: 12, uniques: 9 },
      { event: "field_answered", workbook_id: "w", workbook_code: "AK-AAAAA", unit: 2, n: 9, uniques: 3 },
      { event: "step_finished", workbook_id: "w", workbook_code: "AK-AAAAA", unit: 2, n: 2, uniques: 2 },
      { event: "field_answered", workbook_id: "w", workbook_code: "AK-AAAAA", unit: null, n: 7, uniques: 3 },
      { event: "page_view", workbook_id: "w", workbook_code: "AK-AAAAA", unit: null, n: 70, uniques: 30 },
    ]);
    expect(d).toEqual([
      {
        code: "AK-AAAAA",
        units: [
          { unit: 1, fieldsAnswered: "40", stepsFinished: "12" },
          { unit: 2, fieldsAnswered: "9", stepsFinished: "Fewer than 5" },
        ],
      },
    ]);
  });

  it("lays cohorts out by week with brackets, and hides a cohort under 5 readers entirely", () => {
    const rows = [
      { cohort_week: "2026-09-07", week_offset: 1, steps: 30, cohort_size: 12 },
      { cohort_week: "2026-09-07", week_offset: 2, steps: 20, cohort_size: 12 },
      { cohort_week: "2026-09-07", week_offset: 5, steps: 4, cohort_size: 12 },
      { cohort_week: "2026-09-07", week_offset: 6, steps: 3, cohort_size: 12 },
      { cohort_week: "2026-09-14", week_offset: 1, steps: 90, cohort_size: 3 },
    ];
    const t = cohortTable(rows, 8);
    expect(t.map((c) => c.cohortWeek)).toEqual(["2026-09-14", "2026-09-07"]);
    const big = t[1]!;
    expect(big.suppressed).toBe(false);
    expect(big.size).toBe("12");
    expect(big.weeks).toEqual(["30", "20", "Fewer than 5", "Fewer than 5", "Fewer than 5", "Fewer than 5", "Fewer than 5", "Fewer than 5"]);
    expect(big.brackets).toEqual({ w1_4: "50", w5_8: "7" });
    const small = t[0]!;
    expect(small.suppressed).toBe(true);
    expect(small.size).toBe("Fewer than 5");
    expect(small.weeks.every((w) => w === "Fewer than 5")).toBe(true);
    expect(small.brackets.w1_4).toBe("Fewer than 5");
    expect(JSON.stringify(small)).not.toContain("90");
  });

  it("reads the membership metrics and the weeks parameter", () => {
    expect(
      membershipMetrics([
        { metric: "trials_started", n: 8 },
        { metric: "day_zero_trial_cancels", n: 2 },
        { metric: "nonsense", n: 99 },
      ]),
    ).toEqual({ trials_started: 8, day_zero_trial_cancels: 2, annual_first_month_cancels: 0, cancels: 0 });
    expect(parseWeeks(undefined)).toBe(26);
    expect(parseWeeks("13")).toBe(13);
    expect(parseWeeks("2")).toBe(8);
    expect(parseWeeks("500")).toBe(52);
    expect(suppressed(4)).toBe("Fewer than 5");
    expect(suppressed(5)).toBe("5");
  });
});
