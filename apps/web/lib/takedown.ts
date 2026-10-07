/**
 * Notice and takedown (F-123). Pure: validation for the public notice and
 * counter-notice forms, the submit flow with its effects passed in, the
 * statement of reasons template and the staff queue helpers.
 *
 * The fields follow DMCA 17 U.S.C. 512(c)(3) for a notice and 512(g)(3) for
 * a counter-notice, and EU DSA Article 16(2) for a notice of illegal content.
 * public.submit_takedown_notice (migration 0022) checks every field again,
 * rate limits by a salted hash of the address and stores no raw IP. Whether
 * Akana gets DMCA safe harbour at all is a question for the lawyer (the
 * feature list risk); the form collects what either regime asks for.
 */
import { z } from "zod";
import { hashWithSalt, isBot } from "@/lib/leads";
import { createRateLimiter, type RateLimiter } from "@/lib/rate-limit";
import { BASIS_LABELS, NOTICE_BASES, type NoticeField, type NoticeState, type NoticeValues } from "@/lib/takedown-form";

export type { NoticeBasis, NoticeField, NoticeState, NoticeValues } from "@/lib/takedown-form";
export { BASIS_LABELS, INITIAL_NOTICE_STATE, NOTICE_BASES } from "@/lib/takedown-form";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[0-9 +()./-]{5,40}$/;

const text = (max: number, empty: string, long: string) => z.string().trim().min(1, empty).max(max, long);
const optionalText = (max: number, long: string) =>
  z
    .string()
    .trim()
    .max(max, long)
    .optional()
    .transform((v) => (v ? v : undefined));

const common = {
  name: text(200, "Tell us your full name", "Use 200 characters or fewer"),
  email: z.string().trim().max(254, "Use 254 characters or fewer").regex(EMAIL, "Enter an email address like name@example.com"),
  address: text(500, "Give a postal address", "Use 500 characters or fewer"),
  acting_for: optionalText(200, "Use 200 characters or fewer"),
  location: text(1000, "Say where the material is on Akana: a link or the AK code", "Use 1,000 characters or fewer"),
  signature: text(200, "Type your full name as your signature", "Use 200 characters or fewer"),
};

const noticeSchema = z.object({
  ...common,
  basis: z.enum(NOTICE_BASES, { errorMap: () => ({ message: "Choose what the notice is about" }) }),
  relationship: z.enum(["owner", "agent"], { errorMap: () => ({ message: "Say whether you own the rights or act for the owner" }) }),
  phone: optionalText(40, "Use 40 characters or fewer"),
  work: optionalText(2000, "Use 2,000 characters or fewer"),
  explanation: text(4000, "Explain why the material is unlawful or infringes your rights", "Use 4,000 characters or fewer"),
  good_faith: z.literal(true, { errorMap: () => ({ message: "Tick this box to confirm your good faith belief" }) }),
  accurate: z.literal(true, { errorMap: () => ({ message: "Tick this box to confirm the notice is accurate" }) }),
});

const counterSchema = z.object({
  ...common,
  reference: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^TN-[0-9A-F]{10}$/, "Enter the notice reference from our email, like TN-1A2B3C4D5E"),
  relationship: z.enum(["uploader", "agent"], { errorMap: () => ({ message: "Say whether the work is yours or you act for its owner" }) }),
  phone: z.string().trim().regex(PHONE, "Give a phone number, using digits, spaces and + ( ) - only"),
  explanation: text(4000, "Explain why the removal was a mistake", "Use 4,000 characters or fewer"),
  good_faith: z.literal(true, { errorMap: () => ({ message: "Tick this box to confirm your statement" }) }),
  accurate: z.literal(true, { errorMap: () => ({ message: "Tick this box to confirm the counter-notice is accurate" }) }),
  jurisdiction: z.literal(true, { errorMap: () => ({ message: "Tick this box to accept the court and service terms" }) }),
});

/**
 * Rules across fields, checked on the raw values so they show alongside the
 * field errors in one pass, not after the rest is fixed.
 */
function crossErrors(kind: "notice" | "counter_notice", v: NoticeValues): Errors {
  const out: Errors = {};
  const t = (x: string | undefined) => (x ?? "").trim();
  if (v.relationship === "agent" && !t(v.acting_for)) out.acting_for = "Say who you act for";
  if (kind === "notice") {
    if ((v.basis === "copyright" || v.basis === "trade_mark") && !t(v.work)) out.work = "Describe the work you say is infringed";
    if (v.basis === "copyright" && !t(v.phone)) out.phone = "A copyright notice needs a phone number";
    else if (t(v.phone) && !PHONE.test(t(v.phone))) out.phone = "Use digits, spaces and + ( ) - only";
  }
  return out;
}

export type ParsedNotice = z.infer<typeof noticeSchema>;
export type ParsedCounter = z.infer<typeof counterSchema>;

export function noticeValues(fd: FormData): NoticeValues {
  const s = (k: string) => {
    const v = fd.get(k);
    return typeof v === "string" ? v : undefined;
  };
  return {
    basis: s("basis"),
    relationship: s("relationship"),
    acting_for: s("acting_for"),
    name: s("name"),
    email: s("email"),
    address: s("address"),
    phone: s("phone"),
    work: s("work"),
    location: s("location"),
    explanation: s("explanation"),
    signature: s("signature"),
    reference: s("reference"),
    good_faith: fd.get("good_faith") === "yes",
    accurate: fd.get("accurate") === "yes",
    jurisdiction: fd.get("jurisdiction") === "yes",
  };
}

type Errors = Partial<Record<NoticeField, string>>;

function errorsOf(issues: z.ZodIssue[]): Errors {
  const out: Errors = {};
  for (const i of issues) {
    const k = i.path[0] as NoticeField;
    if (!out[k]) out[k] = i.message;
  }
  return out;
}

export function parseNotice(v: NoticeValues): { ok: true; value: ParsedNotice } | { ok: false; fieldErrors: Errors } {
  const r = noticeSchema.safeParse(v);
  const errors = { ...crossErrors("notice", v), ...(r.success ? {} : errorsOf(r.error.issues)) };
  return r.success && Object.keys(errors).length === 0 ? { ok: true, value: r.data } : { ok: false, fieldErrors: errors };
}

export function parseCounter(v: NoticeValues): { ok: true; value: ParsedCounter } | { ok: false; fieldErrors: Errors } {
  const r = counterSchema.safeParse(v);
  const errors = { ...crossErrors("counter_notice", v), ...(r.success ? {} : errorsOf(r.error.issues)) };
  return r.success && Object.keys(errors).length === 0 ? { ok: true, value: r.data } : { ok: false, fieldErrors: errors };
}

export interface SubmitNoticeArgs {
  p_kind: "notice" | "counter_notice";
  p_basis: string | null;
  p_name: string;
  p_email: string;
  p_address: string;
  p_phone: string | null;
  p_relationship: string;
  p_acting_for: string | null;
  p_work: string | null;
  p_location: string;
  p_explanation: string;
  p_good_faith: boolean;
  p_accurate: boolean;
  p_jurisdiction: boolean | null;
  p_signature: string;
  p_parent_reference: string | null;
  p_ip_hash: string;
}

export type SubmitNotice = (args: SubmitNoticeArgs) => Promise<{ reference: string | null; error: { code?: string } | null }>;
export type NoticeDeps = { submit: SubmitNotice; ip: string; salt: string; limiter?: RateLimiter };

/** One per server instance. The database holds the real limit (5 an hour). */
export const noticeLimiter = createRateLimiter({ limit: 5, windowMs: 60 * 60 * 1000 });

const CHECK = "Check the form. Some answers need fixing.";
const RATE_LIMITED = "You have sent several notices in the last hour. Please try again later, or email us.";
const FAILED = "Your notice was not sent. Please try again in a moment.";
const UNKNOWN_REF = "We cannot find a notice we acted on with that reference. Check the email we sent you.";

export async function processNotice(kind: "notice" | "counter_notice", prev: NoticeState, fd: FormData, deps: NoticeDeps): Promise<NoticeState> {
  const attempt = prev.attempt + 1;
  const values = noticeValues(fd);
  // Bots get a calm failure-free page and nothing is stored. No reference is
  // invented, so a bot cannot tell it apart from a slow path either.
  if (isBot(fd)) return { status: "error", attempt, message: FAILED, fieldErrors: {}, values: {} };

  let args: SubmitNoticeArgs;
  const ipHash = hashWithSalt(deps.ip, deps.salt);
  if (kind === "notice") {
    const p = parseNotice(values);
    if (!p.ok) return { status: "error", attempt, message: CHECK, fieldErrors: p.fieldErrors, values };
    const v = p.value;
    args = {
      p_kind: "notice",
      p_basis: v.basis,
      p_name: v.name,
      p_email: v.email,
      p_address: v.address,
      p_phone: v.phone ?? null,
      p_relationship: v.relationship,
      p_acting_for: v.relationship === "agent" ? (v.acting_for ?? null) : null,
      p_work: v.work ?? null,
      p_location: v.location,
      p_explanation: v.explanation,
      p_good_faith: true,
      p_accurate: true,
      p_jurisdiction: null,
      p_signature: v.signature,
      p_parent_reference: null,
      p_ip_hash: ipHash,
    };
  } else {
    const p = parseCounter(values);
    if (!p.ok) return { status: "error", attempt, message: CHECK, fieldErrors: p.fieldErrors, values };
    const v = p.value;
    args = {
      p_kind: "counter_notice",
      p_basis: null,
      p_name: v.name,
      p_email: v.email,
      p_address: v.address,
      p_phone: v.phone,
      p_relationship: v.relationship,
      p_acting_for: v.relationship === "agent" ? (v.acting_for ?? null) : null,
      p_work: null,
      p_location: v.location,
      p_explanation: v.explanation,
      p_good_faith: true,
      p_accurate: true,
      p_jurisdiction: true,
      p_signature: v.signature,
      p_parent_reference: v.reference,
      p_ip_hash: ipHash,
    };
  }

  if (deps.limiter && !deps.limiter.hit(ipHash)) return { status: "error", attempt, message: RATE_LIMITED, fieldErrors: {}, values };

  const { reference, error } = await deps.submit(args);
  if (error || !reference) {
    console.error("takedown_submit_failed", error?.code ?? "no_reference");
    if (error?.code === "AKN29") return { status: "error", attempt, message: RATE_LIMITED, fieldErrors: {}, values };
    if (error?.code === "AKN04") return { status: "error", attempt, message: UNKNOWN_REF, fieldErrors: { reference: UNKNOWN_REF }, values };
    if (error?.code === "AKN02") return { status: "error", attempt, message: CHECK, fieldErrors: {}, values };
    return { status: "error", attempt, message: FAILED, fieldErrors: {}, values };
  }
  return { status: "success", attempt, reference };
}

// ---------------------------------------------------------------------------
// Staff side
// ---------------------------------------------------------------------------

export const NOTICE_STATUS_LABELS: Record<string, string> = {
  received: "New",
  reviewing: "Reviewing",
  actioned: "Acted on",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export const NOTICE_KIND_LABELS: Record<string, string> = { notice: "Notice", counter_notice: "Counter-notice" };

export function basisLabel(b: string | null | undefined): string {
  return (b && (BASIS_LABELS as Record<string, string>)[b]) || "Unknown";
}

export const REASON_MAX = 2000;
export const STATEMENT_MAX = 8000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

export function cleanText(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max) : "";
}

export interface StatementInput {
  workbookCode: string;
  workbookTitle: string;
  basis: string;
  noticeReference: string;
  noticeDate: Date;
  decisionDate: Date;
  buyersKeepAccess: boolean;
  facts: string;
}

const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" }).format(d);

/**
 * The statement of reasons (DSA Article 17) sent to the organisation whose
 * title is taken down. A template for staff to check and edit before the
 * decision is saved. Draft wording for the lawyer to review.
 */
export function statementOfReasons(s: StatementInput): string {
  const ground =
    s.basis === "copyright"
      ? "The notice says the workbook copies a work in which the sender holds copyright, without permission."
      : s.basis === "trade_mark"
        ? "The notice says the workbook uses a trade mark the sender holds, without permission."
        : "The notice says the workbook contains content that is unlawful.";
  const access = s.buyersKeepAccess
    ? "Readers who already bought it can still open it. Nobody can buy it or start it through the membership."
    : "Readers who bought it can no longer open it. They keep their own answers and can download them.";
  return [
    `Statement of reasons for ${s.workbookCode} (${s.workbookTitle})`,
    "",
    `What we did: on ${day(s.decisionDate)} we took this workbook off sale and out of the library and the membership. ${access}`,
    "",
    `Why: we received notice ${s.noticeReference} on ${day(s.noticeDate)}. ${ground}`,
    "",
    `The facts we relied on: ${s.facts.trim() || "[what staff checked]"}`,
    "",
    "How we decided: a member of the Akana team reviewed the notice and the workbook. No automated means were used to find or decide this.",
    "",
    "What you can do: if you think we got this wrong, you can send a counter-notice at /takedown/counter with the notice reference above, or reply to this message to ask us to look again. You may also use an out-of-court dispute settlement body or go to court.",
  ].join("\n");
}

/**
 * The earliest day to restore a title after a counter-notice under DMCA
 * 512(g)(2)(C): not less than 10 business days after it arrives. UK bank
 * holidays are not counted here; staff check the calendar.
 */
export function earliestReinstateDate(received: Date, businessDays = 10): Date {
  const d = new Date(Date.UTC(received.getUTCFullYear(), received.getUTCMonth(), received.getUTCDate()));
  let n = 0;
  while (n < businessDays) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return d;
}

export function takedownErrorNotice(code: string | undefined | null): string {
  switch (code) {
    case "AKN01":
      return "denied";
    case "AKN02":
      return "td_invalid";
    case "AKN08":
      return "td_state";
    default:
      return "failed";
  }
}

export { day as formatDay };
