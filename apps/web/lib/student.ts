/**
 * The student price (14.22), as pure helpers.
 *
 * 50 percent off membership for a student, checked by an academic email
 * address and checked again every year. The discount is a Stripe coupon whose
 * id is STRIPE_COUPON_STUDENT. Blank means the feature is hidden everywhere
 * and the checkout refuses a student request. The percentage is in
 * public.app_config (student_discount_percent) and is shown for information
 * only: the coupon in Stripe is what takes the money off.
 *
 * Which addresses count is a list of domain endings, STUDENT_EMAIL_SUFFIXES,
 * comma separated, ".ac.uk,.edu" while blank. Only a hash of the address and
 * its domain are stored.
 *
 * The yearly check: a month before the verification ends the reader gets an
 * email asking them to confirm again. If they do not, the discount is taken
 * off the subscription on the end date and they are told. Their next payment
 * is then at the standard price.
 */

export const DEFAULT_STUDENT_SUFFIXES: readonly string[] = [".ac.uk", ".edu"];
export const DEFAULT_STUDENT_PERCENT = 50;

type Env = Record<string, string | undefined>;

/** The coupon id, or null while the feature is off. */
export function studentCouponId(env: Env = process.env): string | null {
  const id = (env.STRIPE_COUPON_STUDENT ?? "").trim();
  return /^[A-Za-z0-9_-]{3,100}$/.test(id) ? id : null;
}

export function studentEnabled(env: Env = process.env): boolean {
  return studentCouponId(env) !== null;
}

/** The accepted endings, lower case with a leading dot. */
export function studentSuffixes(env: Env = process.env): string[] {
  const raw = (env.STUDENT_EMAIL_SUFFIXES ?? "").split(/[\s,;]+/);
  const list = raw
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .map((s) => (s.startsWith(".") ? s : `.${s}`))
    .filter((s) => /^(\.[a-z0-9-]+)+$/.test(s));
  return list.length ? [...new Set(list)] : [...DEFAULT_STUDENT_SUFFIXES];
}

export function emailDomain(email: string): string | null {
  const at = email.trim().toLowerCase().split("@");
  return at.length === 2 && at[0] && at[1] ? at[1] : null;
}

/** True when the address is well formed and its domain ends in an accepted suffix with at least one label before it. */
export function isAcademicEmail(email: unknown, suffixes: readonly string[] = studentSuffixes()): boolean {
  if (typeof email !== "string" || email.length > 254) return false;
  const e = email.trim().toLowerCase();
  if (!/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(e)) return false;
  const domain = emailDomain(e);
  if (!domain || !/^[a-z0-9.-]+$/.test(domain) || domain.includes("..")) return false;
  return suffixes.some((s) => domain.endsWith(s) && domain.length > s.length && !domain.startsWith("."));
}

export async function sha256Hex(text: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const hashEmail = (email: string) => sha256Hex(email.trim().toLowerCase());

export function studentPercentFrom(rows: readonly { key: string; value: unknown }[] | null | undefined): number {
  const n = Number((rows ?? []).find((r) => r.key === "student_discount_percent")?.value);
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n : DEFAULT_STUDENT_PERCENT;
}

export function studentVerifyHoursFrom(rows: readonly { key: string; value: unknown }[] | null | undefined): number {
  const n = Number((rows ?? []).find((r) => r.key === "student_verify_hours")?.value);
  return Number.isInteger(n) && n >= 1 && n <= 168 ? n : 24;
}

export interface StudentRow {
  verified_at: string | null;
  expires_at: string | null;
}

export type StudentStatus =
  | { kind: "none" }
  /** Verified and running. `renewSoon` is true inside the month before the end. */
  | { kind: "verified"; expiresAt: string; renewSoon: boolean }
  | { kind: "expired"; expiredAt: string };

const DAY = 86_400_000;

export function studentStatus(row: StudentRow | null | undefined, now: Date, recheckDays = 30): StudentStatus {
  if (!row?.verified_at || !row.expires_at) return { kind: "none" };
  const end = new Date(row.expires_at).getTime();
  if (!Number.isFinite(end)) return { kind: "none" };
  if (end <= now.getTime()) return { kind: "expired", expiredAt: row.expires_at };
  return { kind: "verified", expiresAt: row.expires_at, renewSoon: end - now.getTime() <= recheckDays * DAY };
}

/** May a checkout apply the student coupon? Only for a running verification. */
export function studentDiscountApplies(status: StudentStatus): boolean {
  return status.kind === "verified";
}

/** The plans the coupon is offered on: one person, monthly or yearly. The shared plans are not. */
export function studentPlanAllowed(plan: string): boolean {
  return plan === "monthly" || plan === "yearly";
}

/**
 * The price after the discount, for display. Stripe rounds to the nearest
 * penny and the checkout page shows the exact figure.
 */
export function discountedMinor(minor: number, percent: number): number {
  return Math.round((minor * (100 - percent)) / 100);
}

/** True when a Stripe discount object carries the student coupon. Handles the older and newer shapes. */
export function discountIsCoupon(d: unknown, couponId: string): boolean {
  if (!d || typeof d !== "object") return false;
  const o = d as { coupon?: unknown; source?: { coupon?: unknown } | null };
  const id = (v: unknown) => (typeof v === "string" ? v : v && typeof v === "object" ? (v as { id?: unknown }).id : undefined);
  return id(o.coupon) === couponId || id(o.source?.coupon) === couponId;
}

export const STUDENT_VERIFY_RESULT_WORDS = {
  verified: "Your email is confirmed. The student price is ready for you at checkout.",
  invalid: "That link does not work. It may have been used already. You can ask for a new one.",
  expired: "That link has run out. You can ask for a new one.",
  email_in_use: "That address is already confirmed on another account. Each address can be used for one account at a time.",
  sign_in: "Sign in to the account you asked from, then open the link again.",
} as const;

export const STUDENT_NOTICES = {
  sent: "We have sent a link to that address. It works for a short time.",
  not_academic: "That does not look like an academic address. Use the email your university or college gave you.",
  failed: "That did not work. Please try again in a few minutes.",
  busy: "You have asked a few times in the last hour. Please wait a while and try again.",
  off: "The student price is not open yet.",
} as const;
