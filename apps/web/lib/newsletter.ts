import { houseStyleIssues } from "@/lib/house-style";
import { isPostalPlaceholder } from "@akana/emails";

/**
 * The weekly newsletter with one exercise (6.11). Pure rules, so what may
 * send, what a person may type and what the cron does are all tested.
 *
 * Guards. Nothing sends while NEWSLETTER_SENDING_DOMAIN is blank. Sign-up and
 * its confirmation email need the domain, an API key and a From address on
 * that domain. An issue also needs EMAIL_MODE=live and a real postal address,
 * because the mailer refuses marketing mail without one. Until then the
 * sign-up page says the newsletter opens soon and collects no address.
 *
 * Content. An issue never names a workbook title (checked against the live
 * titles before it saves), keeps to house style, and a sponsor block is a
 * paid cross-recommendation: a name, one short text and an https link, shown
 * with the label "Sponsored".
 */

export type Readiness = { ok: true } | { ok: false; reason: "domain_blank" | "no_api_key" | "no_from" | "domain_mismatch" | "not_live" | "postal_placeholder" };

type Env = Record<string, string | undefined>;

/** The address and domain in an EMAIL_FROM value such as "Akana <news@mail.example.org>". */
export function parseSendingAddress(from: string | undefined): { address: string; domain: string } | null {
  const raw = (from ?? "").trim();
  const address = (/<([^<>]+)>/.exec(raw)?.[1] ?? raw).trim().toLowerCase();
  const m = /^[^\s@<>"]+@([a-z0-9.-]+\.[a-z]{2,})$/.exec(address);
  return m ? { address, domain: m[1] as string } : null;
}

/** Sign-up and the confirmation email: the sending domain, an API key and a From address on that domain. */
export function signupReadiness(env: Env = process.env): Readiness {
  const domain = (env.NEWSLETTER_SENDING_DOMAIN ?? "").trim().toLowerCase().replace(/^@/, "");
  if (!domain) return { ok: false, reason: "domain_blank" };
  if (!(env.RESEND_API_KEY ?? "").trim()) return { ok: false, reason: "no_api_key" };
  const from = parseSendingAddress(env.EMAIL_FROM);
  if (!from) return { ok: false, reason: "no_from" };
  if (from.domain !== domain && !from.domain.endsWith(`.${domain}`)) return { ok: false, reason: "domain_mismatch" };
  return { ok: true };
}

/** An issue goes out only when sign-up is ready, mail is live and the footer has a real postal address. */
export function sendReadiness(env: Env = process.env): Readiness {
  const signup = signupReadiness(env);
  if (!signup.ok) return signup;
  if (env.EMAIL_MODE !== "live") return { ok: false, reason: "not_live" };
  if (isPostalPlaceholder(env.POSTAL_ADDRESS)) return { ok: false, reason: "postal_placeholder" };
  return { ok: true };
}

export const READINESS_WORDS: Record<Exclude<Readiness, { ok: true }>["reason"], string> = {
  domain_blank: "NEWSLETTER_SENDING_DOMAIN is blank, so nothing sends.",
  no_api_key: "RESEND_API_KEY is blank, so nothing sends.",
  no_from: "EMAIL_FROM is blank or not an address, so nothing sends.",
  domain_mismatch: "EMAIL_FROM is not on the newsletter sending domain, so nothing sends.",
  not_live: "EMAIL_MODE is not live, so issues are held.",
  postal_placeholder: "POSTAL_ADDRESS is still a placeholder, so issues are held.",
};

// ---------------------------------------------------------------------------
// Tokens and addresses
// ---------------------------------------------------------------------------

/** The database makes 64 hex characters (two UUIDs without hyphens). Anything else is not a token. */
export const isNewsletterToken = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);

export function cleanEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  return v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
}

export const confirmUrl = (origin: string, token: string) => `${origin.replace(/\/$/, "")}/newsletter/confirm?t=${token}`;
export const unsubscribeUrl = (origin: string, token: string) => `${origin.replace(/\/$/, "")}/newsletter/unsubscribe?t=${token}`;
/** The one-click address: POST only. A GET redirects to the unsubscribe page and changes nothing. */
export const oneClickUrl = (origin: string, token: string) => `${origin.replace(/\/$/, "")}/api/newsletter/unsubscribe?t=${token}`;

// ---------------------------------------------------------------------------
// Issue content
// ---------------------------------------------------------------------------

export const LIMITS = { subject: 90, preheader: 140, intro: 600, heading: 80, body: 2400, sponsorName: 80, sponsorText: 300, sponsorUrl: 300 } as const;

export interface IssueInput {
  id: string | null;
  subject: string;
  preheader: string;
  intro: string;
  exerciseHeading: string;
  exerciseBody: string;
  sponsorName: string | null;
  sponsorText: string | null;
  sponsorUrl: string | null;
  /** UK local time as typed in the form, "YYYY-MM-DDTHH:mm", or empty. */
  sendAtLocal: string;
  schedule: boolean;
}

export function exerciseParagraphs(body: string): string[] {
  return body
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.replace(/\s*\r?\n\s*/g, " ").trim())
    .filter(Boolean);
}

const clean = (v: unknown): string => (typeof v === "string" ? v.replace(/\r\n/g, "\n").trim() : "");

/** The form fields as an IssueInput. Does not judge them; issueProblems does. */
export function parseIssueForm(f: { get(name: string): unknown }): IssueInput {
  const id = clean(f.get("id"));
  const opt = (name: string) => clean(f.get(name)) || null;
  return {
    id: /^[0-9a-f-]{36}$/.test(id) ? id : null,
    subject: clean(f.get("subject")),
    preheader: clean(f.get("preheader")),
    intro: clean(f.get("intro")),
    exerciseHeading: clean(f.get("exercise_heading")),
    exerciseBody: clean(f.get("exercise_body")),
    sponsorName: opt("sponsor_name"),
    sponsorText: opt("sponsor_text"),
    sponsorUrl: opt("sponsor_url"),
    sendAtLocal: clean(f.get("send_at")),
    schedule: clean(f.get("intent")) === "schedule",
  };
}

/**
 * Workbook titles (or short titles) that appear in the text, whole words only,
 * case-insensitively. Titles under four characters are ignored: they would
 * match ordinary words. The newsletter never names a title.
 */
export function findTitleMentions(text: string, titles: readonly string[]): string[] {
  const hay = text.toLowerCase();
  const found = new Set<string>();
  for (const raw of titles) {
    const t = raw.trim();
    if (t.length < 4) continue;
    const re = new RegExp(`(^|[^a-z0-9])${t.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`);
    if (re.test(hay)) found.add(t);
  }
  return [...found];
}

export interface IssueProblems {
  errors: string[];
  warnings: string[];
}

/** Everything wrong with an issue before it saves. Errors block a save; warnings do not. */
export function issueProblems(input: IssueInput, titles: readonly string[], now: Date = new Date()): IssueProblems {
  const errors: string[] = [];
  const warnings: string[] = [];
  const need = (label: string, value: string, max: number) => {
    if (!value) errors.push(`${label} is needed.`);
    else if (value.length > max) errors.push(`${label} is ${value.length} characters. The limit is ${max}.`);
  };
  need("The subject", input.subject, LIMITS.subject);
  need("The exercise heading", input.exerciseHeading, LIMITS.heading);
  need("The exercise", input.exerciseBody, LIMITS.body);
  if (input.preheader.length > LIMITS.preheader) errors.push(`The preheader is over ${LIMITS.preheader} characters.`);
  if (input.intro.length > LIMITS.intro) errors.push(`The intro is over ${LIMITS.intro} characters.`);
  if (/@/.test(input.subject)) errors.push("The subject must not contain an email address.");

  const parts = [input.sponsorName, input.sponsorText, input.sponsorUrl];
  const given = parts.filter(Boolean).length;
  if (given > 0 && given < 3) errors.push("A sponsor block needs a name, a short text and a link, or none of them.");
  if (input.sponsorUrl && !/^https:\/\/[^\s]+$/.test(input.sponsorUrl)) errors.push("The sponsor link must start with https://.");
  if ((input.sponsorUrl?.length ?? 0) > LIMITS.sponsorUrl) errors.push("The sponsor link is too long.");
  if ((input.sponsorName?.length ?? 0) > LIMITS.sponsorName) errors.push(`The sponsor name is over ${LIMITS.sponsorName} characters.`);
  if ((input.sponsorText?.length ?? 0) > LIMITS.sponsorText) errors.push(`The sponsor text is over ${LIMITS.sponsorText} characters.`);

  const all = [input.subject, input.preheader, input.intro, input.exerciseHeading, input.exerciseBody, input.sponsorName ?? "", input.sponsorText ?? ""].join("\n");
  for (const s of houseStyleIssues(all)) (s.severity === "error" ? errors : warnings).push(s.message);

  const mentions = findTitleMentions(all, titles);
  if (mentions.length) errors.push(`The newsletter never names a workbook title. Remove: ${mentions.slice(0, 3).join(", ")}.`);

  if (input.schedule) {
    const at = londonLocalToDate(input.sendAtLocal);
    if (!at) errors.push("Choose a day and time to send.");
    else if (at.getTime() <= now.getTime()) errors.push("The send time must be in the future.");
  }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

/** "2026-10-26T09:00" in UK time to an instant. Null for anything that is not a real UK local time. */
export function londonLocalToDate(local: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  const check = new Date(naive);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  const offsetAt = (t: number): number => {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(t));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute")) - t;
  };
  let t = naive - offsetAt(naive);
  t = naive - offsetAt(t);
  return new Date(t);
}

/** An instant as "YYYY-MM-DDTHH:mm" in UK time, for a datetime-local input. */
export function dateToLondonLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

// ---------------------------------------------------------------------------
// The cron run
// ---------------------------------------------------------------------------

export interface DueIssue {
  id: string;
  subject: string;
  preheader: string;
  intro: string;
  exerciseHeading: string;
  exerciseBody: string;
  sponsor: { name: string; text: string; url: string } | null;
}

export interface Recipient {
  subscriberId: string;
  email: string;
  token: string;
}

export type SendOutcome = "sent" | "failed" | "refused";

export interface SendRunDeps {
  readiness: Readiness;
  batchSize: number;
  purgePending: () => Promise<number>;
  takeDue: () => Promise<DueIssue | null>;
  recipients: (issueId: string, limit: number) => Promise<Recipient[]>;
  send: (issue: DueIssue, to: Recipient) => Promise<SendOutcome>;
  record: (issueId: string, subscriberId: string, ok: boolean) => Promise<void>;
  finish: (issueId: string) => Promise<boolean>;
  log?: (code: string, detail?: string) => void;
}

export interface SendRunResult {
  status: "not_ready" | "idle" | "partial" | "finished" | "held";
  reason?: string;
  purged: number;
  sent: number;
  failed: number;
}

/**
 * One run of the newsletter cron. Does nothing at all while the sending
 * guards are not met: no purge, no database call, no email. When ready, it
 * removes stale sign-ups, takes the due issue, sends one batch and finishes
 * the issue when nobody is left. A refusal (for example a placeholder postal
 * address) stops the run without recording anything, so the batch is tried
 * again once the setting is fixed.
 */
export async function runNewsletterSend(d: SendRunDeps): Promise<SendRunResult> {
  if (!d.readiness.ok) return { status: "not_ready", reason: d.readiness.reason, purged: 0, sent: 0, failed: 0 };
  const out: SendRunResult = { status: "idle", purged: 0, sent: 0, failed: 0 };
  out.purged = await d.purgePending();
  const issue = await d.takeDue();
  if (!issue) return out;
  const batch = Math.max(1, Math.min(2000, Math.floor(d.batchSize)));
  const list = await d.recipients(issue.id, batch);
  for (const to of list) {
    const outcome = await d.send(issue, to);
    if (outcome === "refused") {
      d.log?.("newsletter_refused", issue.id);
      return { ...out, status: "held", reason: "mailer_refused" };
    }
    await d.record(issue.id, to.subscriberId, outcome === "sent");
    if (outcome === "sent") out.sent += 1;
    else out.failed += 1;
  }
  out.status = (await d.finish(issue.id)) ? "finished" : "partial";
  return out;
}
