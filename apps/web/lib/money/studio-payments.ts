/**
 * The Studio's money pages, the pure part (build list 14.27, 14.28, 14.29,
 * 8.6 and 13.12): the payout calendar from the schedule in royalty_config,
 * the per-sale breakdown, the period a payout covered, the two-share model
 * by channel and the Connect hold banner. No network and no Next, so every
 * figure here can be tested. Amounts are minor units throughout.
 */

export type SaleChannel = "marketplace" | "author_link";

export const CHANNEL_LABELS: Record<SaleChannel, string> = {
  marketplace: "Marketplace",
  author_link: "Your own link",
};

export function parseChannel(v: unknown): SaleChannel {
  return v === "author_link" ? "author_link" : "marketplace";
}

/** What public.payout_schedule() (0039) returns. */
export interface PayoutSchedule {
  payout_cadence: "weekly" | "monthly";
  payout_weekday: number;
  payout_day: number;
  min_payout_minor: Record<string, number>;
  sale_rate_author: number | string;
  sale_rate_author_link: number | string;
  fee_treatment: "deduct" | "akana_carries";
  refund_window_days: number;
  first_payout_hold_days: number;
  is_placeholder: boolean;
}

export const WEEKDAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

export function weekdayName(isoDay: number): string {
  return WEEKDAY_NAMES[isoDay] ?? "Friday";
}

/** The share rate for a channel, as a number between 0 and 1. */
export function channelRate(schedule: Pick<PayoutSchedule, "sale_rate_author" | "sale_rate_author_link">, channel: SaleChannel): number {
  const raw = channel === "author_link" ? schedule.sale_rate_author_link : schedule.sale_rate_author;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/** "50%" from 0.5, with the word placeholder while D1 to D5 are open. */
export function shareLabel(rate: number | string, placeholder: boolean): string {
  const n = Number(rate);
  const pct = Number.isFinite(n) ? `${Math.round(n * 1000) / 10}%` : "";
  return placeholder ? `${pct} (placeholder)` : pct;
}

// ---------------------------------------------------------------------------
// Per-sale breakdown (14.28, 8.6).
// ---------------------------------------------------------------------------

export interface SaleLineInput {
  gross_minor: number | string;
  tax_minor: number | string;
  fee_minor: number | string;
  author_minor: number | string;
  akana_minor: number | string;
  rate?: number | string | null;
  channel?: string | null;
}

export interface SaleBreakdown {
  /** What the reader paid, VAT included. */
  price: number;
  /** VAT as recorded on the receipt; 0 when none was. */
  vat: number;
  /** The card processing fee, when known. 0 when not yet learned. */
  fee: number;
  /** The share base: price less VAT less fee (when fees are deducted). */
  net: number;
  author: number;
  akana: number;
  rate: number | null;
  channel: SaleChannel;
  /** True when author + Akana + fee + VAT come back to the price. */
  balanced: boolean;
}

/** One sale, laid out the way the Studio shows it. Never invents a figure. */
export function saleBreakdown(line: SaleLineInput): SaleBreakdown {
  const price = Number(line.gross_minor) || 0;
  const vat = Number(line.tax_minor) || 0;
  const fee = Number(line.fee_minor) || 0;
  const author = Number(line.author_minor) || 0;
  const akana = Number(line.akana_minor) || 0;
  const rate = line.rate === null || line.rate === undefined || line.rate === "" ? null : Number(line.rate);
  // When Akana carries the fee it sits inside Akana's share, so the four
  // parts come back to the price either way.
  const balanced = author + akana + fee + vat === price || author + akana + vat === price;
  return {
    price,
    vat,
    fee,
    net: Math.max(0, price - vat - fee),
    author,
    akana,
    rate: rate !== null && Number.isFinite(rate) ? rate : null,
    channel: parseChannel(line.channel),
    balanced,
  };
}

// ---------------------------------------------------------------------------
// Payout calendar (14.27).
// ---------------------------------------------------------------------------

/** The year, month and day of an instant in London, as a UTC midnight Date and its ISO weekday. */
function londonDate(at: Date): { day: Date; isoWeekday: number } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const day = new Date(Date.UTC(get("year"), get("month") - 1, get("day")));
  const js = day.getUTCDay(); // 0 Sunday
  return { day, isoWeekday: js === 0 ? 7 : js };
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

export function dayLabel(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(d);
}

function shortDay(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" }).format(d);
}

export interface CalendarWeek {
  /** Monday of the sales week, UTC midnight. */
  weekStart: Date;
  /** Sunday of the sales week. */
  weekEnd: Date;
  /** The payout day: the configured weekday of the following week. */
  payDay: Date;
  /** "Sales from 5 to 11 October are paid on Friday 16 October 2026." */
  sentence: string;
  current: boolean;
}

/**
 * The weekly calendar: sales in a Monday to Sunday week are paid on the
 * configured weekday of the week after. London dates. The first row is the
 * week that holds `now`.
 */
export function weeklyCalendar(now: Date, payoutWeekday: number, weeks = 4): CalendarWeek[] {
  const { day, isoWeekday } = londonDate(now);
  const monday = addDays(day, -(isoWeekday - 1));
  const wd = payoutWeekday >= 1 && payoutWeekday <= 7 ? payoutWeekday : 5;
  const out: CalendarWeek[] = [];
  for (let i = 0; i < weeks; i++) {
    const weekStart = addDays(monday, i * 7);
    const weekEnd = addDays(weekStart, 6);
    const payDay = addDays(weekStart, 7 + (wd - 1));
    out.push({
      weekStart,
      weekEnd,
      payDay,
      sentence: `Sales from ${shortDay(weekStart)} to ${shortDay(weekEnd)} are paid on ${weekdayName(wd)} ${dayLabel(payDay)}.`,
      current: i === 0,
    });
  }
  return out;
}

/** The next monthly payout day on or after now, London date. */
export function nextMonthlyPayout(now: Date, payoutDay: number): Date {
  const { day } = londonDate(now);
  const pd = payoutDay >= 1 && payoutDay <= 28 ? payoutDay : 1;
  const thisMonth = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), pd));
  return thisMonth >= day ? thisMonth : new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, pd));
}

/** "£10.00" for the floor in a currency, or null when the currency has none. */
export function floorFor(schedule: Pick<PayoutSchedule, "min_payout_minor">, currency: string): number | null {
  const v = schedule.min_payout_minor?.[currency];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// ---------------------------------------------------------------------------
// Payments report (14.28): the period a payout covered.
// ---------------------------------------------------------------------------

export interface PayoutRow {
  id: string;
  currency: string;
  livemode: boolean;
  amount_minor: number | string;
  status: "awaiting_approval" | "pending" | "paid" | "failed" | "cancelled";
  stripe_transfer_id: string | null;
  created_at: string;
  paid_at: string | null;
}

export interface StatementPeriod {
  period: string;
  currency: string;
  livemode: boolean;
  closed_at: string;
}

export interface PayoutReportRow extends PayoutRow {
  /** Pending or Paid for the Studio; other states keep their own word. */
  statusLabel: "Pending" | "Paid" | "Failed" | "Cancelled";
  /** The statement months the payout settled, oldest first. Empty when none can be told. */
  periods: string[];
}

export function payoutStatusLabel(status: PayoutRow["status"]): PayoutReportRow["statusLabel"] {
  switch (status) {
    case "paid":
      return "Paid";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    default:
      return "Pending";
  }
}

/**
 * A payout pays the statements closed since the previous payout in the same
 * currency and mode (0021: payable is lines in closed statements, less what
 * was already paid). So the period covered is every statement whose
 * closed_at falls after the previous paid or pending payout was created and
 * on or before this one was. Failed and cancelled payouts cover nothing.
 */
export function payoutPeriods(payouts: PayoutRow[], statements: StatementPeriod[]): PayoutReportRow[] {
  const byKey = new Map<string, PayoutRow[]>();
  for (const p of payouts) {
    const k = `${p.currency}:${p.livemode}`;
    byKey.set(k, [...(byKey.get(k) ?? []), p]);
  }
  const out = new Map<string, string[]>();
  for (const [k, list] of byKey) {
    const live = list.filter((p) => p.status !== "failed" && p.status !== "cancelled").sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    const stmts = statements
      .filter((s) => `${s.currency}:${s.livemode}` === k)
      .sort((a, b) => Date.parse(a.closed_at) - Date.parse(b.closed_at));
    let from = -Infinity;
    for (const p of live) {
      const to = Date.parse(p.created_at);
      out.set(
        p.id,
        stmts
          .filter((s) => {
            const c = Date.parse(s.closed_at);
            return c > from && c <= to;
          })
          .map((s) => s.period)
          .sort(),
      );
      from = to;
    }
  }
  return payouts.map((p) => ({ ...p, amount_minor: Number(p.amount_minor), statusLabel: payoutStatusLabel(p.status), periods: out.get(p.id) ?? [] }));
}

/** "August 2026" or "June to August 2026" from a sorted list of yyyy-mm. */
export function periodsLabel(periods: string[], monthLabel: (p: string) => string): string {
  const head = periods[0];
  const tail = periods[periods.length - 1];
  if (head === undefined || tail === undefined) return "";
  if (periods.length === 1) return monthLabel(head);
  const first = monthLabel(head);
  const last = monthLabel(tail);
  const [fm, fy] = first.split(" ");
  const [, ly] = last.split(" ");
  return fy === ly ? `${fm} to ${last}` : `${first} to ${last}`;
}

// ---------------------------------------------------------------------------
// Connect hold (14.29).
// ---------------------------------------------------------------------------

export interface HoldInput {
  connectStatus: string;
  kind: string;
  isDemo: boolean;
  /** Balances per currency and mode; the hold shows only when something is owed. */
  balances: { currency: string; balance_minor: number | string }[];
}

export interface HoldNotice {
  /** The one step left, in plain words. */
  step: string;
  /** Where the step is done. */
  href: string;
  /** Currencies with money waiting, with the amount. */
  waiting: { currency: string; balance_minor: number }[];
}

/** The one step between the organisation and its first payout, by Connect status. */
export function connectStepLeft(status: string): string | null {
  switch (status) {
    case "not_started":
      return "Connect a payout account through Stripe.";
    case "pending":
      return "Stripe is checking your details. Nothing more is needed from you.";
    case "action_needed":
      return "Stripe needs a little more from you. Open your payouts page to finish.";
    case "held":
      return "Akana is checking how to pay accounts in your country. We will contact you.";
    default:
      return null;
  }
}

/**
 * The banner the Studio shows when earnings are held because Connect
 * onboarding is not complete. Null when verified, when the organisation is
 * not paid through Connect (Akana house, demo), or when nothing is owed yet.
 */
export function connectHold(input: HoldInput): HoldNotice | null {
  if (input.isDemo || input.kind === "akana_house") return null;
  const step = connectStepLeft(input.connectStatus);
  if (!step) return null;
  const waiting = input.balances
    .map((b) => ({ currency: b.currency, balance_minor: Number(b.balance_minor) || 0 }))
    .filter((b) => b.balance_minor > 0);
  if (waiting.length === 0) return null;
  return { step, href: "/payouts", waiting };
}

/** The ISO week an instant falls in, as "2026-W41". One nudge a week keys on it. */
export function isoWeekKey(at: Date): string {
  const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
