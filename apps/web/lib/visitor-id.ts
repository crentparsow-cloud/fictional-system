/**
 * The daily visitor id for first-party analytics (build list 10.4).
 *
 * The rule. A visitor is identified for one UTC day only, by
 *
 *   sha256(salt : yyyy-mm-dd : subject)
 *
 * where the subject is the reader's user id when they are signed in, and
 * the IP address with the user agent when they are not. The salt is
 * LEAD_HASH_SALT, the same server secret the lead forms hash with. Because
 * the date is inside the hash, the id changes every day and two days can
 * never be joined, so there is no profile to build. For a signed-in reader
 * the result is an opaque id that is never their auth id and cannot be
 * turned back into it without the salt. No cookie is set for any of this.
 *
 * The hash is used for one thing: not counting the same visitor twice on the
 * same day for the same event (the `uniques` column in funnel_counts). The
 * rows that hold it (funnel_visitors) are deleted by the daily sweep once
 * the day is over. Nothing about a visitor is shown anywhere; the staff page
 * shows counts, suppressed below 5 per workbook or cohort.
 */
import { createHash } from "node:crypto";

// Same words as lib/leads.ts: local work and tests run without setup, and
// production refuses to hash with a known salt.
const DEV_SALT = "akana-dev-lead-salt-not-for-production";

export function visitorSalt(env: Record<string, string | undefined> = process.env): string {
  const salt = env.LEAD_HASH_SALT;
  if (salt && salt.trim()) return salt;
  if (env.NODE_ENV === "production") throw new Error("LEAD_HASH_SALT is not set");
  return DEV_SALT;
}

/** The UTC day as yyyy-mm-dd. */
export function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** sha256 hex of salt, day and subject. 64 lowercase hex characters, as the table checks. */
export function dailyVisitorHash(o: { salt: string; day: string; subject: string }): string {
  return createHash("sha256").update(`${o.salt}:${o.day}:${o.subject}`, "utf8").digest("hex");
}

type HeaderBag = Pick<Headers, "get">;

function clientIp(h: HeaderBag): string {
  const xff = h.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  return first || h.get("x-real-ip")?.trim() || "unknown";
}

/**
 * What goes into the hash for this request: the user id when signed in,
 * otherwise the address and user agent. Returns null when there is nothing
 * to go on (a server-to-server call with no headers and no user).
 */
export function visitorSubject(headers: HeaderBag | null, userId?: string | null): string | null {
  if (userId) return `user:${userId}`;
  if (!headers) return null;
  const ip = clientIp(headers);
  const ua = headers.get("user-agent")?.trim() ?? "";
  if (ip === "unknown" && !ua) return null;
  return `visitor:${ip}|${ua}`;
}

/**
 * The hash for this request today, or null when nothing identifies it.
 * Never throws outside production; a missing salt there is a configuration
 * fault that should be seen, as with leads.
 */
export function visitorHashFor(headers: HeaderBag | null, userId?: string | null, now: Date = new Date(), env?: Record<string, string | undefined>): string | null {
  const subject = visitorSubject(headers, userId);
  if (!subject) return null;
  return dailyVisitorHash({ salt: visitorSalt(env), day: utcDay(now), subject });
}
