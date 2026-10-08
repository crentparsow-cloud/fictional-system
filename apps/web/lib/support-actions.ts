import type { ReaderProps } from "@akana/emails";
import { knownRoles } from "@/lib/staff-access";

/**
 * The four account lookup actions (F-087). Pure: who may do what, the input
 * checks, the email props, and the messages. The database (migration 0027
 * for restore, resend and cancel; 0021 for refunds) checks every role,
 * reason and ownership again and writes the audit row.
 *
 *   refund            owner, finance   (0021 app.is_money_staff); from the
 *                                      lookup page only staff who can also
 *                                      look up, so in practice owners
 *   resend an email   owner, editor, support (0027, the lookup roles)
 *   restore access    owner, support   (0027 app.can_support_act)
 *   cancel deletion   owner, support   (0027 app.can_support_act)
 */
export interface SupportAbilities {
  refund: boolean;
  resend: boolean;
  restore: boolean;
  cancelDeletion: boolean;
}

export function supportAbilities(rawRoles: readonly unknown[] | null | undefined): SupportAbilities {
  const roles = knownRoles(rawRoles) as string[];
  const any = (want: string[]) => roles.some((r) => want.includes(r));
  const lookup = any(["owner", "editor", "support"]);
  return {
    refund: lookup && any(["owner", "finance"]),
    resend: lookup,
    restore: any(["owner", "support"]),
    cancelDeletion: any(["owner", "support"]),
  };
}

export const ACTION_REASON_MIN = 5;
export const ACTION_REASON_MAX = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUB = /^sub_[A-Za-z0-9]{1,100}$/;
const CODE = /^AK-[0-9A-Z]{5}$/;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

/** Control characters out, trimmed, 5 to 500 characters, or null. */
export function cleanReason(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const r = raw.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return r.length >= ACTION_REASON_MIN && r.length <= ACTION_REASON_MAX ? r : null;
}

export type ActionInput<T> = { ok: true; value: T } | { ok: false; message: string };

const REASON_MESSAGE = `Give a reason of ${ACTION_REASON_MIN} to ${ACTION_REASON_MAX} characters, such as the ticket number.`;

export function parseResend(get: (k: string) => unknown): ActionInput<{ userId: string; kind: "purchase" | "membership"; ref: string; reason: string }> {
  const userId = get("user");
  const kind = get("kind");
  const ref = get("ref");
  const reason = cleanReason(get("reason"));
  if (!isUuid(userId)) return { ok: false, message: "Look the reader up again." };
  if (kind !== "purchase" && kind !== "membership") return { ok: false, message: "Choose which email to resend." };
  if (kind === "purchase" ? !isUuid(ref) : typeof ref !== "string" || !SUB.test(ref)) return { ok: false, message: "Choose which email to resend." };
  if (!reason) return { ok: false, message: REASON_MESSAGE };
  return { ok: true, value: { userId: userId.toLowerCase(), kind, ref: kind === "purchase" ? (ref as string).toLowerCase() : (ref as string), reason } };
}

export function parseRestore(
  get: (k: string) => unknown,
  now: Date = new Date(),
): ActionInput<{ userId: string; entitlementId: string | null; workbookCode: string | null; endsAt: string | null; reason: string }> {
  const userId = get("user");
  const ent = get("entitlement");
  const codeRaw = typeof get("workbook_code") === "string" ? String(get("workbook_code")).trim().toUpperCase() : "";
  const endsRaw = typeof get("ends_on") === "string" ? String(get("ends_on")).trim() : "";
  const reason = cleanReason(get("reason"));
  if (!isUuid(userId)) return { ok: false, message: "Look the reader up again." };
  const entitlementId = isUuid(ent) ? ent.toLowerCase() : null;
  const workbookCode = codeRaw ? codeRaw : null;
  if ((entitlementId === null) === (workbookCode === null)) return { ok: false, message: "Choose an access row to restore, or give one workbook code." };
  if (workbookCode && !CODE.test(workbookCode)) return { ok: false, message: "A workbook code looks like AK-7Q2M9." };
  let endsAt: string | null = null;
  if (endsRaw) {
    if (!workbookCode) return { ok: false, message: "An end date is for a new grant only." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(endsRaw)) return { ok: false, message: "Give the end date as a date." };
    const d = new Date(`${endsRaw}T23:59:59Z`);
    const max = new Date(now.getTime() + 2 * 366 * 86_400_000);
    if (Number.isNaN(d.getTime()) || d.getTime() <= now.getTime() || d.getTime() > max.getTime()) {
      return { ok: false, message: "The end date must be in the future and within two years." };
    }
    endsAt = d.toISOString();
  }
  if (!reason) return { ok: false, message: REASON_MESSAGE };
  return { ok: true, value: { userId: userId.toLowerCase(), entitlementId, workbookCode, endsAt, reason } };
}

export function parseCancelDeletion(get: (k: string) => unknown): ActionInput<{ userId: string; reason: string }> {
  const userId = get("user");
  const reason = cleanReason(get("reason"));
  if (!isUuid(userId)) return { ok: false, message: "Look the reader up again." };
  if (get("confirm") !== "yes") return { ok: false, message: "Tick the box to confirm the reader asked for this." };
  if (!reason) return { ok: false, message: REASON_MESSAGE };
  return { ok: true, value: { userId: userId.toLowerCase(), reason } };
}

/** The 0027 error codes, in words staff can act on. */
export function supportErrorMessage(code: string | null | undefined): string {
  switch (code) {
    case "AKX01":
      return "Your role cannot take this action.";
    case "AKX02":
      return "Check the details and the reason.";
    case "AKX04":
      return "That record does not belong to this reader. Look them up again.";
    case "AKX08":
      return "This cannot be done in the record's current state. Look the reader up again to see it.";
    case "AKX29":
      return "The limit for this action has been reached. Try again later.";
    default:
      return "The action did not run. Try again.";
  }
}

// ---------------------------------------------------------------------------
// Email props. None of them carries a title (the reader templates refuse one).
// ---------------------------------------------------------------------------

export function moneyWords(minor: number | null | undefined, currency: string | null | undefined): string | null {
  if (typeof minor !== "number" || !Number.isFinite(minor) || !currency) return null;
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase() }).format(minor / 100);
  } catch {
    return null;
  }
}

export function dateWords(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" }).format(d);
}

export function firstName(display: string | null | undefined): string | undefined {
  const n = (display ?? "").trim().split(/\s+/)[0];
  return n ? n.slice(0, 60) : undefined;
}

type Base = { appUrl: string; settingsUrl: string; supportEmail: string; name?: string };

export function readerBase(origin: string, supportEmail: string, name?: string | null): Base {
  return { appUrl: `${origin}/home`, settingsUrl: `${origin}/you`, supportEmail, ...(firstName(name) ? { name: firstName(name) } : {}) };
}

export function refundProps(base: Base, amountMinor: number, currency: string, accessEnded: boolean): ReaderProps["refund_confirmed"] | null {
  const amount = moneyWords(amountMinor, currency);
  return amount ? { ...base, amount, accessEnded } : null;
}

export interface ResendContext {
  kind: "purchase" | "membership";
  email: string;
  name: string | null;
  amountMinor: number | null;
  currency: string | null;
  plan: string | null;
  currentPeriodEnd: string | null;
}

export function readResendContext(raw: unknown): ResendContext | null {
  if (!raw || typeof raw !== "object") return null;
  const j = raw as Record<string, unknown>;
  const kind = j.kind === "purchase" || j.kind === "membership" ? j.kind : null;
  const email = typeof j.email === "string" && j.email.includes("@") ? j.email : null;
  if (!kind || !email) return null;
  const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  return {
    kind,
    email,
    name: str(j.name),
    amountMinor: num(j.amount_minor),
    currency: str(j.currency),
    plan: str(j.plan),
    currentPeriodEnd: str(j.current_period_end),
  };
}

/** The props for the resent email, or null when a figure it needs is missing. */
export function resendProps(
  c: ResendContext,
  base: Base,
): { template: "purchase_lifetime"; props: ReaderProps["purchase_lifetime"] } | { template: "purchase_membership"; props: ReaderProps["purchase_membership"] } | null {
  const price = moneyWords(c.amountMinor, c.currency);
  if (!price) return null;
  if (c.kind === "purchase") return { template: "purchase_lifetime", props: { ...base, offerName: "a single workbook", price } };
  const nextDate = dateWords(c.currentPeriodEnd);
  if (!nextDate) return null;
  return {
    template: "purchase_membership",
    props: { ...base, price, periodWords: c.plan === "member_year" ? "a year" : "a month", nextDate },
  };
}
