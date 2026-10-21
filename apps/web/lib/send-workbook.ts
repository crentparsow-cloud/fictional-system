/**
 * "Send this workbook" (14.14), as pure helpers. A paying member gives one
 * full workbook a quarter to someone who has never paid; the recipient claims
 * it from an email link with no card; the author is paid half the list price
 * from the marketing pool (migration 0053, values in app_config 'gift').
 */

export type GiftSendStatus = "sent" | "not_member" | "used_this_quarter" | "not_giftable" | "not_eligible" | "waiting";

export function isGiftSendStatus(v: unknown): v is GiftSendStatus {
  return typeof v === "string" && v in GIFT_SEND_MESSAGES;
}

export const GIFT_SEND_MESSAGES: Readonly<Record<GiftSendStatus, string>> = {
  sent: "Sent. They have 30 days to claim it, and it needs no card.",
  not_member: "Gifts are for members who are paying. A trial does not include one.",
  used_this_quarter: "You have already sent your gift for this quarter.",
  not_giftable: "That workbook cannot be sent just now. Please choose another.",
  not_eligible: "We cannot send a gift to that address. Gifts are for people who have never paid for Akana.",
  waiting: "A gift to that address is already waiting to be claimed.",
};

export type GiftClaimResult = "claimed" | "unchanged" | "unknown" | "expired" | "not_available" | "not_eligible";

export const GIFT_CLAIM_MESSAGES: Readonly<Record<GiftClaimResult, string>> = {
  claimed: "It is yours. You can start whenever you like.",
  unchanged: "You have already claimed this workbook.",
  unknown: "That link is not valid.",
  expired: "That link has expired. Gifts can be claimed for 30 days.",
  not_available: "That gift has already been claimed or has been taken back.",
  not_eligible: "Gifts are for people who have never paid for Akana, so this one cannot be claimed on this account.",
};

export function isGiftClaimResult(v: unknown): v is GiftClaimResult {
  return typeof v === "string" && v in GIFT_CLAIM_MESSAGES;
}

/** The rules, stated on the gift form and the claim page. */
export const GIFT_RULES: readonly string[] = [
  "Each paying member can send one full workbook each quarter. It does not roll over.",
  "It goes to someone who has never paid for Akana. They claim it from an email link and need no card.",
  "Nothing renews and nothing is charged to them. They keep the workbook.",
  "The email does not name the workbook or say who sent it.",
];

/** The calendar quarter of a date in London, as "2026-Q4". Mirrors app.gift_quarter in the database. */
export function giftQuarter(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "numeric" }).formatToParts(at);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
}

/** The first day of the next quarter, for "you can send another from ...". */
export function nextQuarterStart(quarter: string): { year: number; month: number } {
  const m = /^(\d{4})-Q([1-4])$/.exec(quarter);
  if (!m) throw new Error("bad_quarter");
  const year = Number(m[1]);
  const q = Number(m[2]);
  return q === 4 ? { year: year + 1, month: 1 } : { year, month: q * 3 + 1 };
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export function nextQuarterLabel(quarter: string): string {
  const n = nextQuarterStart(quarter);
  return `1 ${MONTHS[n.month - 1]} ${n.year}`;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
/** A tidy address, or null. The database checks again. */
export function cleanGiftEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const e = v.trim().toLowerCase();
  return e.length <= 254 && EMAIL.test(e) ? e : null;
}

const TOKEN = /^[A-Za-z0-9_-]{32}$/;
export const isGiftToken = (v: unknown): v is string => typeof v === "string" && TOKEN.test(v);

export function giftUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/send/${token}`;
}

/** The date in the email, "20 November 2026". */
export function longDateGB(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" }).format(d);
}
