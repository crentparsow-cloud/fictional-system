import { describe, expect, it } from "vitest";
import {
  HIDDEN_TEXT,
  countText,
  csvCell,
  dashboardCsv,
  dashboardError,
  earningsCsv,
  fileSlug,
  groupEarnings,
  money,
  monthLabel,
  monthsIn,
  parseMonthRange,
  pivotDashboard,
  pivotRollup,
  rateText,
  rollupCsv,
  toCsv,
  type DashboardRow,
  type EarningsRow,
  type RollupRow,
} from "./dashboards";

const NOW = new Date("2026-10-07T12:00:00Z");

describe("parseMonthRange", () => {
  it("defaults to the last six months to now", () => {
    const r = parseMonthRange(undefined, undefined, NOW);
    expect(r).toEqual({ from: "2026-05", to: "2026-10", fromDay: "2026-05-01", toDay: "2026-10-31", months: 6 });
  });
  it("keeps a valid range and gets the last day right", () => {
    const r = parseMonthRange("2026-01", "2026-02", NOW);
    expect(r.fromDay).toBe("2026-01-01");
    expect(r.toDay).toBe("2026-02-28");
    expect(r.months).toBe(2);
  });
  it("never goes past this month, never inverts, and caps at 24 months", () => {
    expect(parseMonthRange("2026-01", "2027-05", NOW).to).toBe("2026-10");
    expect(parseMonthRange("2026-09", "2026-03", NOW)).toMatchObject({ from: "2026-03", to: "2026-03", months: 1 });
    expect(parseMonthRange("2020-01", "2026-10", NOW)).toMatchObject({ from: "2024-11", to: "2026-10", months: 24 });
  });
  it("ignores junk", () => {
    expect(parseMonthRange("2026-13", "'; drop", NOW)).toMatchObject({ from: "2026-05", to: "2026-10" });
    expect(parseMonthRange(["2026-07", "x"], undefined, NOW).from).toBe("2026-07");
  });
});

describe("months", () => {
  it("labels and lists newest first", () => {
    expect(monthLabel("2026-08-01")).toBe("August 2026");
    expect(monthLabel("2026-08")).toBe("August 2026");
    expect(monthsIn({ from: "2025-12", to: "2026-02" })).toEqual(["2026-02", "2026-01", "2025-12"]);
  });
});

describe("countText", () => {
  it("shows numbers and hides suppressed ones", () => {
    expect(countText(1234, false)).toBe("1,234");
    expect(countText(null, true)).toBe(HIDDEN_TEXT);
    expect(HIDDEN_TEXT).toBe("Fewer than 10");
    // a number sent with suppressed = true is still hidden
    expect(countText(3, true)).toBe(HIDDEN_TEXT);
  });
});

const row = (month: string, code: string, metric: string, n: number | null, suppressed = n === null): DashboardRow => ({
  month,
  workbook_id: code,
  workbook_code: code,
  workbook_title: `Title ${code}`,
  metric,
  n,
  suppressed,
});

describe("pivotDashboard", () => {
  it("makes one table per month, newest first, with hidden defaults", () => {
    const out = pivotDashboard([
      row("2026-08-01", "AK-B", "listing_views", 15),
      row("2026-09-01", "AK-A", "purchases", null),
      row("2026-08-01", "AK-A", "listing_views", 20),
      row("2026-08-01", "AK-A", "nonsense", 99),
    ]);
    expect(out.map((m) => m.month)).toEqual(["2026-09", "2026-08"]);
    expect(out[1]!.workbooks.map((w) => w.code)).toEqual(["AK-A", "AK-B"]);
    expect(out[1]!.workbooks[0]!.cells.listing_views).toEqual({ n: 20, suppressed: false });
    expect(out[1]!.workbooks[0]!.cells.purchases).toEqual({ n: null, suppressed: true });
  });
  it("never shows a number the database marked suppressed", () => {
    const out = pivotDashboard([row("2026-08-01", "AK-A", "purchases", 4, true)]);
    expect(out[0]!.workbooks[0]!.cells.purchases).toEqual({ n: null, suppressed: true });
  });
});

describe("pivotRollup", () => {
  const r = (scope: string, id: string | null, name: string, metric: string, n: number | null): RollupRow => ({
    month: "2026-08-01",
    scope,
    author_id: id,
    author_name: name,
    metric,
    workbooks: 2,
    n,
    suppressed: n === null,
  });
  const rows = [r("author", "b", "Bea", "listing_views", 12), r("total", null, "All authors", "listing_views", 30), r("author", "a", "Ann", "listing_views", null)];
  it("puts the total first, then authors by name", () => {
    const out = pivotRollup(rows);
    expect(out[0]!.rows.map((x) => x.name)).toEqual(["All authors", "Ann", "Bea"]);
  });
  it("filters to one author and drops the total", () => {
    const out = pivotRollup(rows, "b");
    expect(out[0]!.rows.map((x) => x.name)).toEqual(["Bea"]);
  });
});

describe("money", () => {
  it("formats exact minor units", () => {
    expect(money(416, "GBP")).toBe("£4.16");
    expect(money(-120, "GBP")).toBe("-£1.20");
    expect(money(100000, "USD")).toBe("US$1,000.00");
    expect(money(5, "bad")).toBe("£0.05");
    expect(rateText(0.5)).toBe("50%");
    expect(rateText("0.725")).toBe("72.5%");
    expect(rateText(null)).toBe("");
  });
  it("groups earnings by month, currency and mode, live first", () => {
    const e = (period: string, currency: string, livemode: boolean, author: number, ph = false): EarningsRow => ({
      period,
      workbook_id: "w",
      workbook_code: "AK-A",
      workbook_title: "A",
      currency,
      livemode,
      units: 1,
      gross_minor: 999,
      tax_minor: 167,
      fee_minor: 0,
      refunded_gross_minor: 0,
      sales_author_minor: author,
      refunds_author_minor: 0,
      pool_author_minor: 0,
      author_minor: author,
      sale_rate: 0.5,
      has_placeholder_rate: ph,
    });
    const g = groupEarnings([e("2026-08-01", "GBP", false, 100, true), e("2026-08-01", "GBP", true, 200), e("2026-08-01", "GBP", true, 50), e("2026-09-01", "EUR", true, 7)]);
    expect(g.map((x) => [x.month, x.currency, x.livemode, x.total])).toEqual([
      ["2026-09", "EUR", true, 7],
      ["2026-08", "GBP", true, 250],
      ["2026-08", "GBP", false, 100],
    ]);
    expect(g[2]!.provisional).toBe(true);
    const csv = earningsCsv([e("2026-08-01", "GBP", false, 416, true)]);
    expect(csv.split("\r\n")[1]).toBe("2026-08,test,GBP,AK-A,A,1,9.99,1.67,0.00,0.00,0.5,4.16,0.00,0.00,4.16,yes");
  });
});

describe("CSV", () => {
  it("quotes and defuses formulas", () => {
    expect(csvCell('a "b", c')).toBe('"a ""b"", c"');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+44")).toBe("'+44");
    expect(csvCell("-12")).toBe("-12");
    expect(csvCell(null)).toBe("");
    expect(toCsv(["a", "b"], [[1, "x\ny"]])).toBe('a,b\r\n1,"x\ny"\r\n');
  });
  it("writes hidden counts as text, never a number", () => {
    const csv = dashboardCsv([row("2026-08-01", "AK-A", "purchases", null), row("2026-08-01", "AK-A", "listing_views", 12)]);
    expect(csv).toContain("2026-08,AK-A,Title AK-A,purchases,Fewer than 10");
    expect(csv).toContain("2026-08,AK-A,Title AK-A,listing_views,12");
    const r = rollupCsv([{ month: "2026-08-01", scope: "total", author_id: null, author_name: "All authors", metric: "purchases", workbooks: 3, n: 4, suppressed: true }]);
    expect(r).toContain("Hidden");
    expect(r).not.toMatch(/,4\r\n/);
  });
});

describe("small helpers", () => {
  it("slugs file names and maps errors", () => {
    expect(fileSlug("Pen & Ink Ltd.")).toBe("pen-ink-ltd");
    expect(fileSlug("")).toBe("akana");
    expect(dashboardError("AKD01")).toBe("denied");
    expect(dashboardError("AKD02")).toBe("range");
    expect(dashboardError("XX000")).toBe("failed");
  });
});
