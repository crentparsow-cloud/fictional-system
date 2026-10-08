import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { GENRES } from "@akana/schema";
import { type MailerEnv, type SendLogEntry, type Transport, createDevTransport, createMailer } from "@akana/emails";
import {
  type EnquiryField,
  type EnquiryState,
  type EnquiryValues,
  GENRE_LABELS,
  HONEYPOT_FIELD,
  INTERESTS,
  INTEREST_LABELS,
  KINDS,
  KIND_LABELS,
  SUCCESS_MESSAGE,
} from "@/app/publish/options";
import { mailLog } from "@/lib/mail-ops";
import { type RateLimiter, createRateLimiter } from "@/lib/rate-limit";

/**
 * Leads from the Publish with Akana page (F-001).
 *
 * The flow: parse the form, drop it quietly if the honeypot is filled, hash
 * the IP address and user agent with a server salt, call public.submit_lead
 * (the database checks every field, refuses without consent and rate limits),
 * then tell the Akana team by email. The email is best effort: once the lead
 * is stored the visitor sees success even if the notification fails.
 *
 * The raw IP address and user agent never leave this module. Logs carry
 * error codes and send status only, never the visitor's details.
 */

const optional = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((v) => (v === "" ? undefined : v))
    .optional();

export const leadSchema = z.object({
  name: z.string({ required_error: "Enter your name" }).trim().min(1, "Enter your name").max(200, "Your name must be 200 characters or fewer"),
  email: z
    .string({ required_error: "Enter your email address" })
    .trim()
    .min(1, "Enter your email address")
    .max(254, "Your email address must be 254 characters or fewer")
    .email("Enter an email address in the right format, like name@example.com")
    .transform((v) => v.toLowerCase()),
  kind: z.enum(KINDS, { errorMap: () => ({ message: "Choose what describes you" }) }),
  organisation: optional(200, "Organisation must be 200 characters or fewer"),
  book_title: z.string({ required_error: "Enter the book title" }).trim().min(1, "Enter the book title").max(300, "The book title must be 300 characters or fewer"),
  book_ref: optional(500, "This must be 500 characters or fewer"),
  genre: z.enum(GENRES, { errorMap: () => ({ message: "Choose a genre" }) }),
  interest: z.enum(INTERESTS, { errorMap: () => ({ message: "Choose what you want to talk about" }) }),
  message: optional(4000, "Your message must be 4,000 characters or fewer"),
  consent: z.literal(true, { errorMap: () => ({ message: "Tick the box so we can store your enquiry and reply to it" }) }),
});
export type Lead = z.infer<typeof leadSchema>;

const TEXT_FIELDS = ["name", "email", "kind", "organisation", "book_title", "book_ref", "genre", "interest", "message"] as const;

/** Reads the form into plain values. Files and missing fields become empty strings. */
export function formValues(fd: FormData): EnquiryValues {
  const out: EnquiryValues = {};
  for (const k of TEXT_FIELDS) {
    const v = fd.get(k);
    out[k] = typeof v === "string" ? v : "";
  }
  out.consent = fd.get("consent") === "on" || fd.get("consent") === "true";
  return out;
}

export type ParseResult = { ok: true; lead: Lead } | { ok: false; fieldErrors: Partial<Record<EnquiryField, string>> };

export function parseLead(values: EnquiryValues): ParseResult {
  const r = leadSchema.safeParse(values);
  if (r.success) return { ok: true, lead: r.data };
  const fieldErrors: Partial<Record<EnquiryField, string>> = {};
  for (const issue of r.error.issues) {
    const k = issue.path[0] as EnquiryField | undefined;
    if (k && !fieldErrors[k]) fieldErrors[k] = issue.message;
  }
  return { ok: false, fieldErrors };
}

/** True when the hidden field has anything in it. Only bots fill it. */
export function isBot(fd: FormData): boolean {
  const v = fd.get(HONEYPOT_FIELD);
  return typeof v === "string" ? v.trim() !== "" : v != null;
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

// Used only outside production so local work and tests run without setup.
// Production refuses to start a submission without LEAD_HASH_SALT, because a
// known salt would let anyone with the table reverse the IP hashes.
const DEV_SALT = "akana-dev-lead-salt-not-for-production";

export function leadSalt(env: Record<string, string | undefined> = process.env): string {
  const salt = env.LEAD_HASH_SALT;
  if (salt && salt.trim()) return salt;
  if (env.NODE_ENV === "production") throw new Error("LEAD_HASH_SALT is not set");
  return DEV_SALT;
}

export function hashWithSalt(value: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${value}`, "utf8").digest("hex");
}

/** The caller's IP address from the proxy headers. Vercel sets x-forwarded-for. */
export function clientIp(h: Pick<Headers, "get">): string {
  const xff = h.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  return first || h.get("x-real-ip")?.trim() || "unknown";
}

// ---------------------------------------------------------------------------
// The database call
// ---------------------------------------------------------------------------

export type SubmitLeadArgs = {
  p_kind: string;
  p_name: string;
  p_email: string;
  p_consent: boolean;
  p_ip_hash: string;
  p_user_agent_hash: string | null;
  p_organisation: string | null;
  p_book_title: string | null;
  p_book_ref: string | null;
  p_genre: string | null;
  p_interest: string | null;
  p_message: string | null;
  p_source: string;
};
export type RpcError = { code?: string; message?: string };
export type SubmitLead = (args: SubmitLeadArgs) => Promise<{ id: string | null; error: RpcError | null }>;

/** Calls public.submit_lead through a Supabase client. anon is enough: the function is the gate. */
export function submitLeadWith(client: {
  rpc: (fn: string, args: SubmitLeadArgs) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
}): SubmitLead {
  return async (args) => {
    const { data, error } = await client.rpc("submit_lead", args);
    if (error) return { id: null, error: { code: error.code, message: error.message } };
    return { id: typeof data === "string" ? data : null, error: null };
  };
}

// ---------------------------------------------------------------------------
// The notification to the Akana team
// ---------------------------------------------------------------------------

export type NotifyEnv = MailerEnv & { LEADS_NOTIFY_TO?: string };

/**
 * Sends lead_received. Without LEADS_NOTIFY_TO or RESEND_API_KEY the dev
 * transport records the send and nothing leaves the box. With both set the
 * shared mailer rules apply, including EMAIL_MODE: anything but "live" goes
 * to TEST_RECIPIENT with a [Test] subject.
 */
export async function notifyLead(
  lead: Lead & { id: string },
  o: { env: NotifyEnv; origin: string; now?: Date; transport?: Transport; log?: (e: SendLogEntry) => void },
) {
  const live = Boolean(o.env.LEADS_NOTIFY_TO && o.env.RESEND_API_KEY);
  const dev = live || o.transport ? null : createDevTransport();
  const env: MailerEnv = live
    ? o.env
    : { EMAIL_MODE: "live", EMAIL_FROM: o.env.EMAIL_FROM || "Akana <dev@localhost>", POSTAL_ADDRESS: o.env.POSTAL_ADDRESS };
  const mailer = createMailer({
    env,
    isSuppressed: () => false,
    log: o.log ?? mailLog("publish", "lead_notify"),
    transport: o.transport ?? dev?.transport,
  });
  const when = (o.now ?? new Date()).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/London" });
  return mailer.sendAuthor(
    "lead_received",
    {
      studioUrl: `${o.origin}/admin/leads`,
      supportEmail: o.env.EMAIL_REPLY_TO || "",
      leadId: lead.id,
      receivedAt: when,
      leadName: lead.name,
      leadEmail: lead.email,
      kind: KIND_LABELS[lead.kind],
      organisation: lead.organisation,
      bookTitle: lead.book_title,
      bookRef: lead.book_ref,
      genre: GENRE_LABELS[lead.genre],
      interest: INTEREST_LABELS[lead.interest],
      message: lead.message,
    },
    { to: live ? o.env.LEADS_NOTIFY_TO! : o.env.LEADS_NOTIFY_TO || "leads@localhost", dedupeKey: `lead:${lead.id}` },
  );
}

// ---------------------------------------------------------------------------
// The whole submission, with its effects passed in so it can be tested.
// ---------------------------------------------------------------------------

export type EnquiryDeps = {
  submit: SubmitLead;
  notify: (lead: Lead & { id: string }) => Promise<unknown>;
  ip: string;
  userAgent: string;
  salt: string;
  limiter?: RateLimiter;
};

const RATE_LIMITED = "You have sent several enquiries in the last hour. Please try again later.";
const FAILED = "Your enquiry was not sent. Please try again in a moment.";
const CHECK = "Check the form. Some answers need fixing.";

/** One per server instance. The database holds the real limit. */
export const leadLimiter = createRateLimiter({ limit: 5, windowMs: 60 * 60 * 1000 });

export async function processEnquiry(prev: EnquiryState, fd: FormData, deps: EnquiryDeps): Promise<EnquiryState> {
  const attempt = prev.attempt + 1;
  // Bots get the same success a person gets, and nothing is stored or sent.
  if (isBot(fd)) return { status: "success", attempt, message: SUCCESS_MESSAGE };

  const values = formValues(fd);
  const parsed = parseLead(values);
  if (!parsed.ok) return { status: "error", attempt, message: CHECK, fieldErrors: parsed.fieldErrors, values };
  const lead = parsed.lead;

  const ipHash = hashWithSalt(deps.ip, deps.salt);
  if (deps.limiter && !deps.limiter.hit(ipHash)) {
    return { status: "error", attempt, message: RATE_LIMITED, fieldErrors: {}, values };
  }

  const { id, error } = await deps.submit({
    p_kind: lead.kind,
    p_name: lead.name,
    p_email: lead.email,
    p_consent: lead.consent,
    p_ip_hash: ipHash,
    p_user_agent_hash: deps.userAgent ? hashWithSalt(deps.userAgent, deps.salt) : null,
    p_organisation: lead.organisation ?? null,
    p_book_title: lead.book_title,
    p_book_ref: lead.book_ref ?? null,
    p_genre: lead.genre,
    p_interest: lead.interest,
    p_message: lead.message ?? null,
    p_source: "publish_page",
  });

  if (error || !id) {
    console.error("lead_submit_failed", error?.code ?? "no_id");
    if (error?.code === "AKL29") return { status: "error", attempt, message: RATE_LIMITED, fieldErrors: {}, values };
    if (error?.code === "AKL01") {
      return { status: "error", attempt, message: CHECK, fieldErrors: { consent: "Tick the box so we can store your enquiry and reply to it" }, values };
    }
    if (error?.code === "AKL02") return { status: "error", attempt, message: CHECK, fieldErrors: {}, values };
    return { status: "error", attempt, message: FAILED, fieldErrors: {}, values };
  }

  try {
    await deps.notify({ ...lead, id });
  } catch (e) {
    console.error("lead_notify_failed", e instanceof Error ? e.name : "unknown");
  }
  return { status: "success", attempt, message: SUCCESS_MESSAGE };
}
