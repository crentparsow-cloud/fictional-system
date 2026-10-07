/**
 * Earnings, the privacy-safe dashboard and the publisher roll-up (F-041,
 * F-042, F-058). Pure helpers shared by the pages and the CSV routes.
 *
 * Small counts never reach this code: public.org_dashboard and
 * public.publisher_rollup_counts (migration 0022) return null with
 * suppressed = true for anything under the author threshold
 * (app_config.suppression_threshold_author, 10). These helpers only decide
 * how a hidden count reads. Money is exact (question D7).
 */

export const DASHBOARD_METRICS = ["listing_views", "free_weeks_started", "purchases", "finished_week_one", "finished_final_week"] as const;
export type DashboardMetric = (typeof DASHBOARD_METRICS)[number];

export const METRIC_LABELS: Record<DashboardMetric, string> = {
  listing_views: "Listing views",
  free_weeks_started: "Free weeks started",
  purchases: "Purchases",
  finished_week_one: "Finished week one",
  finished_final_week: "Finished the final week",
};

/** The threshold the database applies. Shown in copy only; the database decides. */
export const AUTHOR_THRESHOLD = 10;
export const HIDDEN_TEXT = `Fewer than ${AUTHOR_THRESHOLD}`;
/** For a roll-up total hidden because a part of it is small. */
export const HIDDEN_TOTAL_TEXT = "Hidden";

export function isMetric(v: unknown): v is DashboardMetric {
  return typeof v === "string" && (DASHBOARD_METRICS as readonly string[]).includes(v);
}

export function countText(n: number | null | undefined, suppressed: boolean, hidden: string = HIDDEN_TEXT): string {
  if (suppressed || n === null || n === undefined) return hidden;
  return Number(n).toLocaleString("en-GB");
}

// ---------------------------------------------------------------------------
// Month ranges: ?from=YYYY-MM&to=YYYY-MM, whole months, 24 at most
// ---------------------------------------------------------------------------

export const MAX_MONTHS = 24;
export const DEFAULT_MONTHS = 6;

export interface MonthRange {
  /** yyyy-mm */
  from: string;
  to: string;
  /** First and last day, yyyy-mm-dd, for the database. */
  fromDay: string;
  toDay: string;
  months: number;
}

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

function monthIndex(m: string): number | null {
  const r = MONTH.exec(m);
  if (!r) return null;
  return Number(r[1]) * 12 + (Number(r[2]) - 1);
}

function fromIndex(i: number): string {
  const y = Math.floor(i / 12);
  const m = (i % 12) + 1;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
}

function lastDay(m: string): string {
  const i = monthIndex(m)!;
  const y = Math.floor(i / 12);
  const mo = i % 12;
  const d = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  return `${m}-${String(d).padStart(2, "0")}`;
}

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** The month range from the query, defaulting to the last six months to now. */
export function parseMonthRange(fromRaw: string | string[] | undefined, toRaw: string | string[] | undefined, now: Date = new Date()): MonthRange {
  const nowIdx = now.getUTCFullYear() * 12 + now.getUTCMonth();
  let to = monthIndex(one(toRaw) ?? "") ?? nowIdx;
  if (to > nowIdx) to = nowIdx;
  let from = monthIndex(one(fromRaw) ?? "") ?? to - (DEFAULT_MONTHS - 1);
  if (from > to) from = to;
  if (to - from + 1 > MAX_MONTHS) from = to - (MAX_MONTHS - 1);
  const f = fromIndex(from);
  const t = fromIndex(to);
  return { from: f, to: t, fromDay: `${f}-01`, toDay: lastDay(t), months: to - from + 1 };
}

/** "August 2026" from a date or yyyy-mm(-dd) string. */
export function monthLabel(d: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(d);
  if (!m) return d;
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)));
}

/** The months in a range, newest first, as yyyy-mm. */
export function monthsIn(range: Pick<MonthRange, "from" | "to">): string[] {
  const a = monthIndex(range.from)!;
  const b = monthIndex(range.to)!;
  const out: string[] = [];
  for (let i = b; i >= a; i--) out.push(fromIndex(i));
  return out;
}

// ---------------------------------------------------------------------------
// Dashboard tables
// ---------------------------------------------------------------------------

export interface DashboardRow {
  month: string;
  workbook_id: string;
  workbook_code: string;
  workbook_title: string;
  metric: string;
  n: number | null;
  suppressed: boolean;
}

export interface DashboardCell {
  n: number | null;
  suppressed: boolean;
}

export interface DashboardMonth {
  month: string;
  workbooks: { code: string; title: string; cells: Record<DashboardMetric, DashboardCell> }[];
}

const hiddenCells = (): Record<DashboardMetric, DashboardCell> =>
  Object.fromEntries(DASHBOARD_METRICS.map((m) => [m, { n: null, suppressed: true }])) as Record<DashboardMetric, DashboardCell>;

/** One table per month, one row per workbook, newest month first. */
export function pivotDashboard(rows: readonly DashboardRow[]): DashboardMonth[] {
  const byMonth = new Map<string, Map<string, { code: string; title: string; cells: Record<DashboardMetric, DashboardCell> }>>();
  for (const r of rows) {
    if (!isMetric(r.metric)) continue;
    const month = String(r.month).slice(0, 7);
    let m = byMonth.get(month);
    if (!m) byMonth.set(month, (m = new Map()));
    let w = m.get(r.workbook_code);
    if (!w) m.set(r.workbook_code, (w = { code: r.workbook_code, title: r.workbook_title, cells: hiddenCells() }));
    // A count only shows when the database sent a number and did not suppress it.
    w.cells[r.metric] = r.suppressed || r.n === null ? { n: null, suppressed: true } : { n: Number(r.n), suppressed: false };
  }
  return [...byMonth.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, m]) => ({ month, workbooks: [...m.values()].sort((a, b) => a.code.localeCompare(b.code)) }));
}

export interface RollupRow {
  month: string;
  scope: "author" | "total" | string;
  author_id: string | null;
  author_name: string;
  metric: string;
  workbooks: number;
  n: number | null;
  suppressed: boolean;
}

export interface RollupMonth {
  month: string;
  rows: { key: string; name: string; scope: string; workbooks: number; cells: Record<DashboardMetric, DashboardCell> }[];
}

/** One table per month: the total row first, then authors by name. */
export function pivotRollup(rows: readonly RollupRow[], authorFilter?: string | null): RollupMonth[] {
  const byMonth = new Map<string, Map<string, RollupMonth["rows"][number]>>();
  for (const r of rows) {
    if (!isMetric(r.metric)) continue;
    if (authorFilter && r.scope === "author" && r.author_id !== authorFilter) continue;
    if (authorFilter && r.scope === "total") continue;
    const month = String(r.month).slice(0, 7);
    let m = byMonth.get(month);
    if (!m) byMonth.set(month, (m = new Map()));
    const key = r.scope === "total" ? "total" : (r.author_id ?? "none");
    let row = m.get(key);
    if (!row) m.set(key, (row = { key, name: r.author_name, scope: r.scope, workbooks: Number(r.workbooks) || 0, cells: hiddenCells() }));
    row.cells[r.metric] = r.suppressed || r.n === null ? { n: null, suppressed: true } : { n: Number(r.n), suppressed: false };
  }
  return [...byMonth.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, m]) => ({
      month,
      rows: [...m.values()].sort((a, b) => (a.scope === "total" ? -1 : b.scope === "total" ? 1 : a.name.localeCompare(b.name))),
    }));
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/** £4.16 from 416 and GBP. Exact, minor units in, never rounded further. */
export function money(minor: number | string | null | undefined, currency: string): string {
  const n = Number(minor ?? 0);
  const cur = /^[A-Z]{3}$/.test(currency) ? currency : "GBP";
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: cur }).format(n / 100);
  } catch {
    return `${(n / 100).toFixed(2)} ${cur}`;
  }
}

/** 0.5 to "50%". */
export function rateText(rate: number | string | null | undefined): string {
  if (rate === null || rate === undefined || rate === "") return "";
  const n = Number(rate);
  if (!Number.isFinite(n)) return "";
  return `${Math.round(n * 1000) / 10}%`;
}

export interface EarningsRow {
  period: string;
  workbook_id: string | null;
  workbook_code: string | null;
  workbook_title: string | null;
  currency: string;
  livemode: boolean;
  units: number;
  gross_minor: number;
  tax_minor: number;
  fee_minor: number;
  refunded_gross_minor: number;
  sales_author_minor: number;
  refunds_author_minor: number;
  pool_author_minor: number;
  author_minor: number;
  sale_rate: number | string | null;
  has_placeholder_rate: boolean;
}

export interface EarningsMonth {
  month: string;
  currency: string;
  livemode: boolean;
  rows: EarningsRow[];
  total: number;
  provisional: boolean;
}

/** Group by month, currency and mode, newest first, live before test. */
export function groupEarnings(rows: readonly EarningsRow[]): EarningsMonth[] {
  const map = new Map<string, EarningsMonth>();
  for (const r of rows) {
    const month = String(r.period).slice(0, 7);
    const key = `${month}|${r.currency}|${r.livemode ? 1 : 0}`;
    let g = map.get(key);
    if (!g) map.set(key, (g = { month, currency: r.currency, livemode: Boolean(r.livemode), rows: [], total: 0, provisional: false }));
    g.rows.push(r);
    g.total += Number(r.author_minor) || 0;
    g.provisional ||= Boolean(r.has_placeholder_rate);
  }
  return [...map.values()].sort(
    (a, b) => b.month.localeCompare(a.month) || Number(b.livemode) - Number(a.livemode) || a.currency.localeCompare(b.currency),
  );
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/**
 * One CSV cell. Quotes when needed, and puts an apostrophe before a value a
 * spreadsheet would run as a formula (=, +, -, @, tab, return), because
 * titles and names come from people.
 */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: readonly string[], rows: readonly (readonly unknown[])[]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function dashboardCsv(rows: readonly DashboardRow[]): string {
  return toCsv(
    ["month", "workbook_code", "workbook_title", "metric", "count"],
    rows
      .filter((r) => isMetric(r.metric))
      .map((r) => [String(r.month).slice(0, 7), r.workbook_code, r.workbook_title, r.metric, r.suppressed || r.n === null ? HIDDEN_TEXT : r.n]),
  );
}

export function rollupCsv(rows: readonly RollupRow[]): string {
  return toCsv(
    ["month", "scope", "author", "metric", "workbooks", "count"],
    rows
      .filter((r) => isMetric(r.metric))
      .map((r) => [String(r.month).slice(0, 7), r.scope, r.author_name, r.metric, r.workbooks, r.suppressed || r.n === null ? HIDDEN_TOTAL_TEXT : r.n]),
  );
}

const minorToDecimal = (v: number | string | null | undefined) => (Number(v ?? 0) / 100).toFixed(2);

export function earningsCsv(rows: readonly EarningsRow[]): string {
  return toCsv(
    [
      "month",
      "mode",
      "currency",
      "workbook_code",
      "workbook_title",
      "units",
      "gross",
      "vat",
      "fees",
      "refunded_gross",
      "sale_rate",
      "sales_share",
      "refunds_share",
      "membership_pool_share",
      "total_share",
      "provisional_rate",
    ],
    rows.map((r) => [
      String(r.period).slice(0, 7),
      r.livemode ? "live" : "test",
      r.currency,
      r.workbook_code ?? "",
      r.workbook_title ?? "",
      r.units,
      minorToDecimal(r.gross_minor),
      minorToDecimal(r.tax_minor),
      minorToDecimal(r.fee_minor),
      minorToDecimal(r.refunded_gross_minor),
      r.sale_rate ?? "",
      minorToDecimal(r.sales_author_minor),
      minorToDecimal(r.refunds_author_minor),
      minorToDecimal(r.pool_author_minor),
      minorToDecimal(r.author_minor),
      r.has_placeholder_rate ? "yes" : "no",
    ]),
  );
}

export interface RollupEarningsRow {
  period: string;
  scope: string;
  author_id: string | null;
  author_name: string;
  currency: string;
  livemode: boolean;
  units: number;
  author_minor: number;
  has_placeholder_rate: boolean;
}

export function rollupEarningsCsv(rows: readonly RollupEarningsRow[]): string {
  return toCsv(
    ["month", "mode", "currency", "scope", "author", "units", "share", "provisional_rate"],
    rows.map((r) => [
      String(r.period).slice(0, 7),
      r.livemode ? "live" : "test",
      r.currency,
      r.scope,
      r.author_name,
      r.units,
      minorToDecimal(r.author_minor),
      r.has_placeholder_rate ? "yes" : "no",
    ]),
  );
}

/** A safe file name part from an organisation name. */
export function fileSlug(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "akana"
  );
}

/** The error the database raised, as a page state. */
export function dashboardError(code: string | undefined | null): "denied" | "range" | "failed" {
  if (code === "AKD01") return "denied";
  if (code === "AKD02") return "range";
  return "failed";
}
