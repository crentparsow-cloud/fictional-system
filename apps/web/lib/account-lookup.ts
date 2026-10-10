/**
 * Staff account lookup (F-087). Pure: the abilities, input checks and the
 * shape of what public.staff_lookup_account (migration 0022) returns.
 *
 * The database decides everything that matters: owners, editors and support
 * only, a reason of 5 to 500 characters, one audit row per lookup (found or
 * not), sixty lookups an hour per person. It returns no answers, enrolments,
 * progress, check-ins or titles. Workbooks appear by AK code only.
 */
import { knownRoles } from "@/lib/staff-access";

export const LOOKUP_ROLES = ["owner", "editor", "support"] as const;
export const TAKEDOWN_READ_ROLES = ["owner", "editor", "support"] as const;
export const TAKEDOWN_DECIDE_ROLES = ["owner", "editor"] as const;

export interface DashAbilities {
  lookupAccounts: boolean;
  readTakedowns: boolean;
  decideTakedowns: boolean;
}

/** Mirrors app.can_lookup_accounts, app.can_read_takedowns and app.can_decide_takedowns (0022). */
export function dashAbilities(rawRoles: readonly unknown[] | null | undefined): DashAbilities {
  const roles = knownRoles(rawRoles) as string[];
  const any = (want: readonly string[]) => roles.some((r) => want.includes(r));
  return {
    lookupAccounts: any(LOOKUP_ROLES),
    readTakedowns: any(TAKEDOWN_READ_ROLES),
    decideTakedowns: any(TAKEDOWN_DECIDE_ROLES),
  };
}

export const LOOKUP_REASON_MIN = 5;
export const LOOKUP_REASON_MAX = 500;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type LookupInput = { ok: true; email: string; reason: string } | { ok: false; field: "email" | "reason"; message: string };

export function parseLookupInput(emailRaw: unknown, reasonRaw: unknown): LookupInput {
  const email = typeof emailRaw === "string" ? emailRaw.trim().toLowerCase() : "";
  const reason = typeof reasonRaw === "string" ? reasonRaw.replace(/[\u0000-\u001f\u007f]/g, " ").trim() : "";
  if (!email || email.length > 254 || !EMAIL.test(email)) return { ok: false, field: "email", message: "Enter the reader's email address." };
  if (reason.length < LOOKUP_REASON_MIN || reason.length > LOOKUP_REASON_MAX)
    return { ok: false, field: "reason", message: `Give a reason of ${LOOKUP_REASON_MIN} to ${LOOKUP_REASON_MAX} characters, such as the ticket number.` };
  return { ok: true, email, reason };
}

type Json = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0) || 0);
const bool = (v: unknown): boolean => v === true;
const arr = (v: unknown): Json[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Json[]) : []);
const obj = (v: unknown): Json | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null);

export interface LookupResult {
  found: boolean;
  user?: {
    id: string;
    email: string | null;
    createdAt: string | null;
    emailConfirmedAt: string | null;
    lastSignInAt: string | null;
    bannedUntil: string | null;
    staff: boolean;
  };
  profile?: { displayName: string | null; locale: string | null; country: string | null; adultConfirmedAt: string | null } | null;
  consents?: { healthAt: string | null; healthVersion: string | null; faithAt: string | null; faithVersion: string | null } | null;
  terms: { doc: string; version: string; context: string; wasDraft: boolean; acceptedAt: string | null }[];
  deletion: {
    state: "pending" | "cancelled" | "completed";
    requestedAt: string | null;
    cancelBefore: string | null;
    cancelledAt: string | null;
    completedAt: string | null;
    /** 0027: still inside the undo window, so staff may cancel it for the reader. */
    canCancel: boolean;
  } | null;
  purchases: {
    id: string;
    kind: string;
    workbookCode: string | null;
    currency: string;
    amountMinor: number;
    taxMinor: number;
    status: string;
    createdAt: string | null;
    paidAt: string | null;
    refundedAt: string | null;
    paymentIntent: string | null;
  }[];
  subscriptions: {
    plan: string | null;
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    canceledAt: string | null;
    endedAt: string | null;
    pastDueSince: string | null;
    subscriptionId: string | null;
  }[];
  entitlements: {
    /** 0027: the row id, for restore access. Null from an older database. */
    id: string | null;
    workbookCode: string | null;
    source: string;
    status: string;
    startsAt: string | null;
    endsAt: string | null;
    takenDown: boolean;
  }[];
  lookups: { at: string | null; actorRole: string | null; reason: string | null }[];
  /** 0027: the last staff actions on the account (restore, resend, cancel deletion). */
  actions: { at: string | null; action: string; actorRole: string | null; reason: string | null }[];
}

/** Read the jsonb defensively. Unknown keys are dropped, never shown. */
export function readLookup(raw: unknown): LookupResult {
  const j = obj(raw) ?? {};
  const empty: LookupResult = { found: false, terms: [], deletion: null, purchases: [], subscriptions: [], entitlements: [], lookups: [], actions: [] };
  if (!bool(j.found)) return empty;
  const u = obj(j.user) ?? {};
  const p = obj(j.profile);
  const c = obj(j.consents);
  const d = obj(j.deletion);
  const state = str(d?.state);
  return {
    found: true,
    user: {
      id: String(u.id ?? ""),
      email: str(u.email),
      createdAt: str(u.created_at),
      emailConfirmedAt: str(u.email_confirmed_at),
      lastSignInAt: str(u.last_sign_in_at),
      bannedUntil: str(u.banned_until),
      staff: bool(u.staff),
    },
    profile: p ? { displayName: str(p.display_name), locale: str(p.locale), country: str(p.country), adultConfirmedAt: str(p.adult_confirmed_at) } : null,
    consents: c ? { healthAt: str(c.health_at), healthVersion: str(c.health_version), faithAt: str(c.faith_at), faithVersion: str(c.faith_version) } : null,
    terms: arr(j.terms).map((t) => ({
      doc: String(t.doc ?? ""),
      version: String(t.version ?? ""),
      context: String(t.context ?? ""),
      wasDraft: bool(t.was_draft),
      acceptedAt: str(t.accepted_at),
    })),
    deletion:
      d && (state === "pending" || state === "cancelled" || state === "completed")
        ? {
            state,
            requestedAt: str(d.requested_at),
            cancelBefore: str(d.cancel_before),
            cancelledAt: str(d.cancelled_at),
            completedAt: str(d.completed_at),
            canCancel: bool(d.can_cancel),
          }
        : null,
    purchases: arr(j.purchases).map((x) => ({
      id: String(x.id ?? ""),
      kind: String(x.kind ?? ""),
      workbookCode: str(x.workbook_code),
      currency: String(x.currency ?? "GBP"),
      amountMinor: num(x.amount_minor),
      taxMinor: num(x.tax_minor),
      status: String(x.status ?? ""),
      createdAt: str(x.created_at),
      paidAt: str(x.paid_at),
      refundedAt: str(x.refunded_at),
      paymentIntent: str(x.stripe_payment_intent_id),
    })),
    subscriptions: arr(j.subscriptions).map((x) => ({
      plan: str(x.plan),
      status: String(x.status ?? ""),
      currentPeriodEnd: str(x.current_period_end),
      cancelAtPeriodEnd: bool(x.cancel_at_period_end),
      canceledAt: str(x.canceled_at),
      endedAt: str(x.ended_at),
      pastDueSince: str(x.past_due_since),
      subscriptionId: str(x.stripe_subscription_id),
    })),
    entitlements: arr(j.entitlements).map((x) => ({
      id: str(x.id),
      workbookCode: str(x.workbook_code),
      source: String(x.source ?? ""),
      status: String(x.status ?? ""),
      startsAt: str(x.starts_at),
      endsAt: str(x.ends_at),
      takenDown: bool(x.taken_down),
    })),
    lookups: arr(j.lookups).map((x) => ({ at: str(x.at), actorRole: str(x.actor_role), reason: str(x.reason) })),
    actions: arr(j.actions).map((x) => ({ at: str(x.at), action: String(x.action ?? ""), actorRole: str(x.actor_role), reason: str(x.reason) })),
  };
}

/** One plain line for the account's state. */
export function accountStatusLine(r: LookupResult, now: Date = new Date()): string {
  if (!r.found || !r.user) return "No account uses that email address.";
  if (r.deletion?.state === "completed") return "Deleted. Only tax records remain.";
  if (r.deletion?.state === "pending") return "Deletion requested. It can still be cancelled by the reader.";
  if (r.user.bannedUntil && new Date(r.user.bannedUntil).getTime() > now.getTime()) return "Blocked from signing in.";
  if (!r.user.emailConfirmedAt && r.user.lastSignInAt === null) return "Active. No sign-in recorded yet.";
  return "Active.";
}

/** Labels for the staff actions listed on an account (0027). */
export const ACTION_LABELS: Record<string, string> = {
  "account.access_restored": "Access restored",
  "account.email_resent": "Email resent",
  "account.deletion_cancelled_by_staff": "Deletion cancelled for the reader",
};

/** A purchase or gift row that is revoked, lapsed or past its end: one staff may restore. */
export function canRestoreRow(e: LookupResult["entitlements"][number], now: Date = new Date()): boolean {
  if (!e.id || e.takenDown) return false;
  if (e.source !== "purchase" && e.source !== "gift") return false;
  const ended = e.endsAt ? new Date(e.endsAt).getTime() <= now.getTime() : false;
  return e.status !== "active" || ended;
}

export const PLAN_LABELS: Record<string, string> = {
  member_month: "Monthly membership",
  member_year: "Yearly membership",
  member_two_month: "Monthly membership for two people",
};

export const DOC_LABELS: Record<string, string> = {
  reader_terms: "Reader terms",
  author_terms: "Author terms",
  publisher_terms: "Publisher terms",
  saas_terms: "White-label terms",
  dpa: "Data processing agreement",
  subprocessors: "Subprocessors",
};

export function lookupErrorMessage(code: string | undefined | null): string {
  switch (code) {
    case "AKD01":
      return "Your role cannot look up accounts.";
    case "AKD02":
      return "Check the email address and the reason.";
    case "AKD29":
      return "You have made sixty lookups in the last hour. Try again later.";
    default:
      return "The lookup did not run. Try again.";
  }
}
