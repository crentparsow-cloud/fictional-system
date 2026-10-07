/**
 * Money formatting and small parsers for the ledger pages, statements and
 * the refund console (M6). Pure, so the pages, the statement files and the
 * tests share one answer. Amounts are always whole minor units (pence,
 * cents); nothing here uses floating point for money beyond display.
 */

const SYMBOLS: Record<string, string> = { GBP: "£", USD: "$", EUR: "€", AUD: "A$", CAD: "C$", NZD: "NZ$" };

/** 12345, "GBP" -> "£123.45"; -500 -> "-£5.00". Unknown currencies get the code. */
export function formatMinor(minor: number | bigint | null | undefined, currency: string): string {
  const n = typeof minor === "bigint" ? Number(minor) : (minor ?? 0);
  const code = currency.toUpperCase();
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(n));
  const whole = Math.floor(abs / 100).toLocaleString("en-GB");
  const pence = String(abs % 100).padStart(2, "0");
  const symbol = SYMBOLS[code];
  return symbol ? `${sign}${symbol}${whole}.${pence}` : `${sign}${whole}.${pence} ${code}`;
}

/** The same amount in plain digits for a CSV: -500 -> "-5.00". */
export function plainMinor(minor: number | bigint | null | undefined): string {
  const n = typeof minor === "bigint" ? Number(minor) : (minor ?? 0);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(n));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/**
 * "12.50" or "12" -> 1250. Accepts a leading currency symbol and commas.
 * Returns null for anything else, for zero and for more than two decimals.
 */
export function parseMajorToMinor(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().replace(/^[£$€]/, "").replace(/,/g, "");
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const minor = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return minor > 0 ? minor : null;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-08" -> "August 2026". */
export function periodLabel(period: string): string {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  if (!m) return period;
  return `${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

export function isPeriod(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

/** A rate stored as 0.5000 -> "50%". */
export function rateLabel(rate: number | string | null | undefined): string {
  if (rate === null || rate === undefined || rate === "") return "";
  const n = Number(rate);
  if (!Number.isFinite(n)) return "";
  const pct = Math.round(n * 10000) / 100;
  return `${pct}%`;
}

/** Plain words for each ledger line kind, used on statements and in admin. */
export const LINE_KIND_LABELS: Record<string, string> = {
  sale: "Sale",
  refund: "Refund",
  dispute: "Payment disputed",
  dispute_reversal: "Dispute won",
  pool: "Membership pool",
  fee_correction: "Payment fee confirmed",
  adjustment: "Adjustment",
  payout: "Paid to you",
  payout_reversal: "Reclaimed from a payout",
  withholding: "Tax withheld",
};

/** Plain words for each payout decision reason (F-103). */
export const PAYOUT_REASON_LABELS: Record<string, string> = {
  ok: "Ready to pay",
  above_approval_threshold: "Above the approval threshold: a person must approve",
  not_paid_out: "Akana house or demo organisation: never paid out",
  held: "On hold",
  unverified: "Payouts not verified in Stripe",
  tax_details_missing: "Tax residence not given",
  manual_review_country: "Country outside self-serve payouts: manual review",
  in_progress: "A payout is already waiting",
  nothing_due: "Nothing due",
  currency_not_set: "No minimum set for this currency",
  below_minimum: "Below the minimum payout",
  rates_placeholder: "Rates are placeholders: live payouts refused",
  first_payout_hold: "First payout held until the first sale is old enough",
};

export function labelOf(map: Record<string, string>, key: string | null | undefined): string {
  if (!key) return "";
  return map[key] ?? key;
}
