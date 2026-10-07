/**
 * Check-in partner (F-030, first named "Support partner"). Pure helpers
 * shared by the You page, the two partner routes, the public /respond page
 * and the tests. Nothing here touches the network or the database.
 *
 * The rules that matter, enforced again in migration 0012:
 *  - A partner never sees answers, workbook titles, themes or stage names.
 *    They get what the share level allows and nothing else.
 *  - Token links are random, single-purpose, stored only as a sha256 hash,
 *    expire, and stop working the moment the reader stops sharing.
 *  - Progress on a wellbeing workbook is shared only when the reader ticks
 *    that choice (isWellbeingTier in lib/consent.ts decides which is which).
 */

export type ShareLevel = 1 | 2 | 3;
export type PartnerStatus = "invited" | "accepted" | "declined" | "stopped";
export type TokenPurpose = "respond" | "report" | "reply" | "stop";
export type LinkState = "ok" | "unknown" | "expired" | "used" | "revoked";

/** Reader-facing name of the feature. Internal names stay "partner". */
export const FEATURE_NAME = "Check-in partner";

/** What each share level sends, in the words the You page and the respond page use. */
export const SHARE_LEVELS: Record<ShareLevel, { label: string; detail: string; partnerGets: string[] }> = {
  1: {
    label: "Stage reached",
    detail: "A short email when you reach a new stage. Nothing else.",
    partnerGets: ["A short email when they reach a new stage, never more than once a week."],
  },
  2: {
    label: "Stage and a check-in nudge",
    detail: "As above, plus a gentle question they could ask you.",
    partnerGets: ["A short email when they reach a new stage, never more than once a week.", "A gentle question you could ask them, if you want to."],
  },
  3: {
    label: "Stage, nudge and a short note",
    detail: "As above, plus a short note you write for them. It goes out once, with the next update.",
    partnerGets: [
      "A short email when they reach a new stage, never more than once a week.",
      "A gentle question you could ask them, if you want to.",
      "Now and then, a short note from them.",
    ],
  },
};

/** What a partner never sees, said the same way everywhere. */
export const NEVER_SHARED = "They never see your answers, what you write, or which workbook you're using.";

export function parseShareLevel(v: unknown): ShareLevel | null {
  const n = Number(typeof v === "string" ? v.trim() : v);
  return n === 1 || n === 2 || n === 3 ? n : null;
}

// ---------------------------------------------------------------------------
// Cleaning what people type. The database checks again.
// ---------------------------------------------------------------------------

/** First names: letters, spaces, apostrophes and hyphens only, at most 30 characters. */
export function cleanName(s: unknown): string {
  return String(s ?? "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{M} '’-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 30)
    .trim();
}

const LINKY = [
  /[^\s@]+@[^\s@]+/g,
  /\b(?:https?:\/\/|www\.)\S*/gi,
  /\b[\w-]+(?:\.[\w-]+)*\.(?:com|net|org|io|co|uk|us|ca|au|nz|ie|me|app|ly|gg|info|biz|xyz|link|site|page|dev)\b\S*/gi,
  /\+?\d[\d\s().-]{5,}\d/g,
];

function stripLinky(s: string): string {
  let out = s.normalize("NFKC");
  for (const re of LINKY) out = out.replace(re, "");
  return out
    .replace(/[<>@]/g, "")
    .replace(/https?:/gi, "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The reader's note for level 3: no links, addresses or phone numbers, at most 200 characters. */
export function cleanNote(s: unknown): string {
  return stripLinky(String(s ?? "")).slice(0, 200).trim();
}

/** A partner's few kind words back: the same rules, at most 280 characters. */
export function cleanReply(s: unknown): string {
  return stripLinky(String(s ?? "")).slice(0, 280).trim();
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
export function cleanEmail(s: unknown): string | null {
  const e = String(s ?? "").trim().toLowerCase();
  return EMAIL.test(e) && e.length <= 254 ? e : null;
}

// ---------------------------------------------------------------------------
// Tokens. 32 random bytes, base64url, 43 characters. Only the hash is stored.
// ---------------------------------------------------------------------------

export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isTokenShaped(t: unknown): t is string {
  return typeof t === "string" && TOKEN_PATTERN.test(t);
}

export function mintToken(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const bytes = random(32);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function hashToken(token: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function respondUrl(origin: string, token: string, ask?: "decline"): string {
  return `${origin}/respond/${token}${ask ? `?a=${ask}` : ""}`;
}

// ---------------------------------------------------------------------------
// The You page.
// ---------------------------------------------------------------------------

export interface PartnerRow {
  partner_name: string;
  partner_email: string;
  reader_name: string;
  share_level: number;
  include_wellbeing: boolean;
  note: string | null;
  note_sent_at: string | null;
  status: PartnerStatus;
  stopped_by: "reader" | "partner" | null;
  invited_at: string;
  invite_expires_at: string;
  responded_at: string | null;
  stopped_at: string | null;
}

export type PartnerView =
  | { kind: "none" }
  | { kind: "invited"; row: PartnerRow }
  | { kind: "active"; row: PartnerRow }
  | { kind: "ended"; row: PartnerRow; line: string };

/** What the section shows for the reader's row right now. */
export function partnerView(row: PartnerRow | null | undefined, now: Date): PartnerView {
  if (!row) return { kind: "none" };
  const name = row.partner_name;
  if (row.status === "accepted") return { kind: "active", row };
  if (row.status === "invited") {
    if (new Date(row.invite_expires_at).getTime() > now.getTime()) return { kind: "invited", row };
    return { kind: "ended", row, line: `${name} didn't answer the invitation in time. You can invite them, or someone else, again.` };
  }
  if (row.status === "declined") return { kind: "ended", row, line: `${name} said no thanks. That's fine. You can invite someone else.` };
  if (row.stopped_by === "partner") return { kind: "ended", row, line: `${name} stopped the updates. You can invite someone else if you like.` };
  return { kind: "ended", row, line: `You stopped sharing with ${name}. They were told, and their links no longer work.` };
}

/** Notices after a partner action on the You page. Unknown values show nothing. */
export const PARTNER_NOTICES = {
  invited: "Invitation sent. We'll let you know when they say yes.",
  saved: "Saved. Your check-in partner will see only what you chose.",
  stopped: "Sharing stopped. Your check-in partner has been told, and their links no longer work.",
  removed: "Their details have been removed.",
  "check-form": "Please check the names and the email address.",
  "pick-level": "Please choose what to share.",
  self: "Please invite someone other than yourself.",
  blocked: "An invitation can't be sent to that address.",
  exists: "You already have a check-in partner. Stop sharing first to invite someone new.",
  "deletion-pending": "Your account is scheduled for deletion, so new invitations are off.",
  "rate-limited": "You can send three invitations a month. Please try again later.",
  "note-invalid": "Please keep the note short, with no links, email addresses or phone numbers.",
  failed: "That didn't work just now. Nothing has changed. Please try again.",
} as const;
export type PartnerNotice = keyof typeof PARTNER_NOTICES;

export function partnerNoticeText(code: string | string[] | undefined): string | null {
  const c = Array.isArray(code) ? code[0] : code;
  return c && c in PARTNER_NOTICES ? PARTNER_NOTICES[c as PartnerNotice] : null;
}

/** Maps a 0012 error code from the invite function to a notice. */
export function inviteErrorNotice(code: string | undefined): PartnerNotice {
  switch (code) {
    case "AKP02":
      return "check-form";
    case "AKP03":
      return "self";
    case "AKP04":
      return "blocked";
    case "AKP05":
      return "exists";
    case "AKP06":
      return "deletion-pending";
    case "AKP29":
      return "rate-limited";
    default:
      return "failed";
  }
}

// ---------------------------------------------------------------------------
// The respond page.
// ---------------------------------------------------------------------------

export type RespondAction = "accept" | "decline" | "report" | "stop" | "reply";
export const RESPOND_ACTIONS: readonly RespondAction[] = ["accept", "decline", "report", "stop", "reply"];
export function parseRespondAction(v: unknown): RespondAction | null {
  return typeof v === "string" && (RESPOND_ACTIONS as readonly string[]).includes(v) ? (v as RespondAction) : null;
}

/** Outcomes from public.partner_link_act, plus "failed" for anything else. */
export type RespondOutcome =
  | "accepted"
  | "declined"
  | "reported"
  | "stopped"
  | "replied"
  | "already"
  | "inactive"
  | "expired"
  | "unknown"
  | "invalid_message"
  | "reply_limit"
  | "failed";

const OUTCOMES: readonly RespondOutcome[] = ["accepted", "declined", "reported", "stopped", "replied", "already", "inactive", "expired", "unknown", "invalid_message", "reply_limit", "failed"];
export function parseOutcome(v: unknown): RespondOutcome | null {
  return typeof v === "string" && (OUTCOMES as readonly string[]).includes(v) ? (v as RespondOutcome) : null;
}

export type Calm = { title: string; body: string };

/** The page for a link that does not work, whatever the reason. Nothing about the reader. */
export function calmLinkPage(state: Exclude<LinkState, "ok"> | "inactive"): Calm {
  switch (state) {
    case "expired":
      return { title: "This link has expired", body: "Nothing has changed. If you want to stop hearing from us, use the link in the most recent email." };
    case "revoked":
    case "inactive":
      return { title: "This link is no longer active", body: "Nothing has changed, and you won't hear from us about it again." };
    case "used":
      return { title: "Already done", body: "This link has been used, so there's nothing more to do here." };
    default:
      return { title: "This link isn't working", body: "It may have been copied only in part, or it may have ended. Nothing has changed." };
  }
}

/** The line after an action. reader is the reader's first name, already cleaned. */
export function outcomeMessage(outcome: RespondOutcome, reader: string): Calm {
  const who = reader || "your friend";
  switch (outcome) {
    case "accepted":
      return { title: "Thank you", body: `You'll get a short note when ${who} reaches a new stage. Every email has a link to stop.` };
    case "declined":
      return { title: "No problem", body: "You won't hear from us again, and no more invitations will reach this address." };
    case "reported":
      return { title: "Reported and blocked", body: "Thank you for telling us. No more invitations will reach your address." };
    case "stopped":
      return { title: "Updates stopped", body: "You won't get any more updates." };
    case "replied":
      return { title: "Sent", body: `${who.charAt(0).toUpperCase() + who.slice(1)} will see your message in the app. Thank you.` };
    case "already":
      return { title: "Already done", body: "Your answer is already recorded." };
    case "invalid_message":
      return { title: "Please try again", body: "Write a short message, up to 280 characters, without links, email addresses or phone numbers." };
    case "reply_limit":
      return { title: "That's plenty for now", body: "You've sent a few messages this week already. Please try again in a few days." };
    case "expired":
      return calmLinkPage("expired");
    case "inactive":
      return calmLinkPage("inactive");
    case "unknown":
      return calmLinkPage("unknown");
    default:
      return { title: "Something went wrong", body: "Nothing has changed. Please try again in a moment." };
  }
}

/** Headers for every partner response: never cached, never indexed, never leaking the link. */
export const PARTNER_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Referrer-Policy": "no-referrer",
} as const;

/** True when a browser form post came from this site. Mail clients' one-click POSTs are handled separately. */
export function isSameOriginPost(headers: { get(name: string): string | null }): boolean {
  const site = headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = headers.get("origin");
  if (!origin) return site === "same-origin";
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  try {
    return Boolean(host) && new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** This site's origin, from the request, the way the billing route works it out. */
export function originFrom(headers: { get(name: string): string | null }): string {
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? process.env.AKANA_HOST ?? "localhost:3000";
  const proto = headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
