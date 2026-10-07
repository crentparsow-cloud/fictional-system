/**
 * Author Studio and publisher console helpers (F-033 to F-037, F-055,
 * F-056). Pure: nothing here touches the network or the database, so the
 * pages, the actions, the upload route and the tests share one answer.
 *
 * The rules that matter are enforced again in migration 0013:
 *  - Invitations are bound to one email address and the token is stored
 *    only as a sha256 hash (the check-in partner pattern, lib/partner.ts).
 *  - Only Akana staff make or unmake an organisation owner.
 *  - A bio goes public only after staff approve it.
 *  - The licence text is a lawyer draft. Nobody signs it for a real book
 *    until a lawyer-approved version exists.
 *  - A workbook cannot go live without an active licence for its book.
 */
import { claimPatterns, CLAIM_ALLOW } from "@akana/validate";

export { hashToken, isTokenShaped, mintToken } from "@/lib/partner";

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export const ORG_ROLES = ["owner", "editor", "finance", "author", "viewer"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  owner: "Owner",
  editor: "Editor",
  finance: "Finance",
  author: "Author",
  viewer: "Viewer",
};

export const ORG_ROLE_HELP: Record<OrgRole, string> = {
  owner: "Everything, including signing licences and payouts. Set by Akana staff.",
  editor: "Books and workbooks.",
  finance: "Payouts and statements.",
  author: "Their own profile and workbooks.",
  viewer: "Can look, not change.",
};

/** Roles an organisation owner may give. Owner is staff only. */
export const OWNER_GRANTABLE_ROLES: readonly OrgRole[] = ["editor", "finance", "author", "viewer"];

export function parseOrgRole(v: unknown): OrgRole | null {
  return typeof v === "string" && (ORG_ROLES as readonly string[]).includes(v) ? (v as OrgRole) : null;
}

/** Mirrors org_permissions (0001) for what the UI offers. RLS still decides. */
export function roleCan(role: string | null | undefined) {
  const r = parseOrgRole(role);
  return {
    manageMembers: r === "owner",
    writeBooks: r === "owner" || r === "editor",
    writeWorkbooks: r === "owner" || r === "editor" || r === "author",
    signLicences: r === "owner",
    readLicences: r === "owner" || r === "editor" || r === "author",
  };
}

// ---------------------------------------------------------------------------
// Cleaning input. The database checks again.
// ---------------------------------------------------------------------------

export function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").trim().slice(0, max).trim() : "";
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
export function cleanEmail(v: unknown): string | null {
  const e = String(v ?? "")
    .trim()
    .toLowerCase();
  return EMAIL.test(e) && e.length <= 254 ? e : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

export function httpsUrl(v: unknown, max = 300): string | null {
  const s = str(v, max);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" && !/[\s<>"]/.test(s) ? s : null;
  } catch {
    return null;
  }
}

/** Up to five https links, one per line. Null when any line is not a link. */
export function parseLinks(v: unknown): string[] | null {
  const lines = String(v ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length > 5) return null;
  const out: string[] = [];
  for (const l of lines) {
    const u = httpsUrl(l);
    if (!u) return null;
    out.push(u);
  }
  return out;
}

// ---------------------------------------------------------------------------
// ISBNs (F-035)
// ---------------------------------------------------------------------------

export function normaliseIsbn(s: string): string {
  return s.replace(/[\s-]/g, "").toUpperCase();
}

/** True for a valid ISBN-10 or ISBN-13 check digit. */
export function isValidIsbn(raw: string): boolean {
  const s = normaliseIsbn(raw);
  if (/^[0-9]{9}[0-9X]$/.test(s)) {
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += (s[i] === "X" ? 10 : Number(s[i])) * (10 - i);
    return sum % 11 === 0;
  }
  if (/^97[89][0-9]{10}$/.test(s)) {
    let sum = 0;
    for (let i = 0; i < 13; i++) sum += Number(s[i]) * (i % 2 === 0 ? 1 : 3);
    return sum % 10 === 0;
  }
  return false;
}

/** ISBNs from a text box, separated by commas or new lines. Null when any is invalid. */
export function parseIsbns(v: unknown): string[] | null {
  const parts = String(v ?? "")
    .split(/[,\n]/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length > 10) return null;
  const out = new Set<string>();
  for (const p of parts) {
    if (!isValidIsbn(p)) return null;
    out.add(normaliseIsbn(p));
  }
  return [...out];
}

// ---------------------------------------------------------------------------
// Bio claim check (F-034, using the F-108 claim rules)
// ---------------------------------------------------------------------------

/**
 * The claim phrases in a bio, using the strictest set (the wellbeing genre
 * at the standard tier), because a bio sits beside every genre. Allowed
 * negations such as "not a diagnosis" are removed first.
 */
export function bioClaimFlags(bio: string): string[] {
  const text = bio.replace(CLAIM_ALLOW, " ");
  const re = claimPatterns("wellbeing", "standard");
  const found = new Set<string>();
  for (const m of text.matchAll(re)) found.add(m[0].toLowerCase());
  return [...found].slice(0, 50);
}

// ---------------------------------------------------------------------------
// Licence (F-036)
// ---------------------------------------------------------------------------

/** The licence text on file. A new lawyer version is a new file and a new row in licence_texts. */
export const LICENCE_FILE = "author-licence.md";
export const LICENCE_VERSION = "0.1.0-draft";

export type LicenceTextRow = { version: string; status: "draft" | "approved" | "retired"; is_placeholder: boolean; content_sha256: string };

export type LicenceTextState =
  | { kind: "signable"; row: LicenceTextRow }
  | { kind: "demo_only"; row: LicenceTextRow }
  | { kind: "draft"; row: LicenceTextRow }
  | { kind: "mismatch"; row: LicenceTextRow }
  | { kind: "missing" };

/**
 * Can this organisation sign the text on file? A draft can be signed only by
 * a demo organisation, as a test. A file that does not match the hash the
 * database holds for its version is never signable.
 */
export function licenceTextState(row: LicenceTextRow | null | undefined, fileSha: string | null, orgIsDemo: boolean): LicenceTextState {
  if (!row || !fileSha) return { kind: "missing" };
  if (row.content_sha256 !== fileSha) return { kind: "mismatch", row };
  if (row.status === "approved") return { kind: "signable", row };
  if (row.status === "draft" && orgIsDemo) return { kind: "demo_only", row };
  return { kind: "draft", row };
}

export const LICENCE_DRAFT_NOTICE =
  "This licence is a draft waiting for the lawyer. You can read it, but nobody can sign it for a real book until the approved version is in place.";

export const LICENCE_STATUS_LABELS: Record<string, string> = {
  test_only: "Test signature on the draft",
  pending_verification: "Signed copy waiting for Akana to check",
  active: "Active",
  rejected: "Not accepted",
  superseded: "Replaced by a newer licence",
};

/** Territories: WORLD or two-letter codes, separated by commas or spaces. */
export function parseTerritories(v: unknown, allowEmpty = false): string[] | null {
  const parts = String(v ?? "")
    .toUpperCase()
    .split(/[\s,]+/)
    .filter(Boolean);
  if (parts.length === 0) return allowEmpty ? [] : null;
  if (parts.length > 250) return null;
  for (const p of parts) if (!/^([A-Z]{2}|WORLD)$/.test(p)) return null;
  return [...new Set(parts)];
}

export interface LicenceTerms {
  territories: string[];
  excluded: string[];
  termMonths: number;
  exclusiveMonths: number | null;
  subscription: boolean;
  cover: boolean;
  audio: boolean;
  signerName: string;
  signerCapacity: string;
}

function yesNo(v: unknown): boolean | null {
  return v === "yes" ? true : v === "no" ? false : null;
}

export function parseLicenceTerms(get: (k: string) => unknown): { ok: true; terms: LicenceTerms } | { ok: false; field: string } {
  const territories = parseTerritories(get("territories"));
  if (!territories) return { ok: false, field: "territories" };
  const excluded = parseTerritories(get("excluded"), true);
  if (!excluded) return { ok: false, field: "excluded" };
  const termMonths = Number(get("term_months"));
  if (!Number.isInteger(termMonths) || termMonths < 1 || termMonths > 600) return { ok: false, field: "term_months" };
  const exRaw = str(get("exclusive_months"), 4);
  const exclusiveMonths = exRaw === "" ? null : Number(exRaw);
  if (exclusiveMonths !== null && (!Number.isInteger(exclusiveMonths) || exclusiveMonths < 0 || exclusiveMonths > termMonths)) {
    return { ok: false, field: "exclusive_months" };
  }
  const subscription = yesNo(get("subscription"));
  const cover = yesNo(get("cover"));
  const audio = yesNo(get("audio"));
  if (subscription === null || cover === null || audio === null) return { ok: false, field: "terms" };
  const signerName = str(get("signer_name"), 200);
  const signerCapacity = str(get("signer_capacity"), 120);
  if (signerName.length < 2 || /[<>]/.test(signerName)) return { ok: false, field: "signer_name" };
  if (signerCapacity.length < 2 || /[<>]/.test(signerCapacity)) return { ok: false, field: "signer_capacity" };
  return { ok: true, terms: { territories, excluded, termMonths, exclusiveMonths, subscription, cover, audio, signerName, signerCapacity } };
}

// ---------------------------------------------------------------------------
// Files. Uploads use the F-135 private file component and paths
// (lib/storage/file-rules.ts); this only names what was uploaded.
// ---------------------------------------------------------------------------

export const SUBMISSION_FILE_KINDS = {
  manuscript: "Manuscript",
  existing_workbook: "Existing workbook",
  other: "Other file",
} as const;
export type SubmissionFileKind = keyof typeof SUBMISSION_FILE_KINDS;

export function parseSubmissionFileKind(v: unknown): SubmissionFileKind | null {
  return typeof v === "string" && v in SUBMISSION_FILE_KINDS ? (v as SubmissionFileKind) : null;
}

/** The stored display name. The person's own file name never reaches a path, a URL or a log. */
export function storedFileName(kind: SubmissionFileKind, ext: string): string {
  return `${SUBMISSION_FILE_KINDS[kind]}.${ext}`;
}

// ---------------------------------------------------------------------------
// Submissions (F-037)
// ---------------------------------------------------------------------------

export const SUBMISSION_STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted, waiting for the Akana team",
  accepted: "Accepted, being built",
  quoted: "Quote sent",
  deposit_paid: "Deposit paid, being built",
  changes_requested: "Changes requested",
  completed: "Built",
  declined: "Declined",
  withdrawn: "Withdrawn",
};

export const SUBMISSION_ROUTES = {
  upload: { label: "Send your manuscript", help: "Upload the manuscript and any workbook you already have. Akana's editors build the interactive version." },
  develop: { label: "Ask Akana to develop it", help: "Tell us about the book. We send a quote, and a deposit starts the work." },
} as const;
export type SubmissionRoute = keyof typeof SUBMISSION_ROUTES;

export function parseRoute(v: unknown): SubmissionRoute | null {
  return v === "upload" || v === "develop" ? v : null;
}

export function formatMoney(minor: number | null | undefined, currency: string | null | undefined): string {
  if (minor == null || !currency) return "";
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

// ---------------------------------------------------------------------------
// First-run checklist (F-033)
// ---------------------------------------------------------------------------

export type ChecklistInput = {
  profileDone: boolean;
  bookCount: number;
  licence: "active" | "test_only" | "pending" | "none";
  connectStatus: string;
  submissionCount: number;
};

export type ChecklistItem = { key: string; title: string; state: "done" | "todo" | "waiting"; line: string; href: string };

export function checklist(c: ChecklistInput, q = ""): ChecklistItem[] {
  return [
    {
      key: "profile",
      title: "Your profile",
      state: c.profileDone ? "done" : "todo",
      line: c.profileDone ? "Your name and bio are in. Staff check the bio before it shows." : "Pen name, legal name and a short bio.",
      href: `/studio/profile${q}`,
    },
    {
      key: "book",
      title: "Add a book",
      state: c.bookCount > 0 ? "done" : "todo",
      line: c.bookCount > 0 ? `${c.bookCount} ${c.bookCount === 1 ? "book" : "books"} added.` : "The book the workbook comes from.",
      href: `/studio/books${q}`,
    },
    {
      key: "licence",
      title: "Sign the licence",
      state: c.licence === "active" ? "done" : c.licence === "pending" ? "waiting" : "todo",
      line:
        c.licence === "active"
          ? "Signed."
          : c.licence === "pending"
            ? "Your signed copy is with Akana to check."
            : c.licence === "test_only"
              ? "Signed as a test on the draft. It does not count."
              : "Waiting for the lawyer's approved version. You can read the draft now.",
      href: `/studio/books${q}`,
    },
    {
      key: "payouts",
      title: "Set up payouts",
      state: c.connectStatus === "verified" ? "done" : c.connectStatus === "pending" ? "waiting" : "todo",
      line: c.connectStatus === "verified" ? "Payouts are set up." : c.connectStatus === "pending" ? "Stripe is checking your details." : "Connect a bank account through Stripe.",
      href: "/payouts",
    },
    {
      key: "submit",
      title: "Submit a workbook",
      state: c.submissionCount > 0 ? "done" : "todo",
      line: c.submissionCount > 0 ? `${c.submissionCount} submitted.` : "Send a manuscript, or ask Akana to develop it.",
      href: `/studio/books${q}`,
    },
  ];
}

// ---------------------------------------------------------------------------
// Notices. The URL carries a fixed code, never free text.
// ---------------------------------------------------------------------------

export const STUDIO_NOTICES = {
  saved: { tone: "ok", text: "Saved." },
  "bio-sent": { tone: "ok", text: "Bio sent to the Akana team. It shows on your public page once they approve it." },
  "bio-flagged": { tone: "ok", text: "Bio sent. Some phrases were flagged for the team to look at. They may ask you to change them." },
  "book-created": { tone: "ok", text: "Book added." },
  "isbn-invalid": { tone: "error", text: "One of the ISBNs is not valid. Check the digits." },
  "isbn-taken": { tone: "error", text: "That ISBN is already on another book. Contact Akana if it is yours." },
  "licence-signed": { tone: "ok", text: "Licence signed. A copy of the terms is kept with your signature." },
  "licence-test": { tone: "ok", text: "Test signature recorded on the draft. It does not count as a licence." },
  "licence-uploaded": { tone: "ok", text: "Signed copy received. Akana will check it and let you know." },
  "licence-draft": { tone: "error", text: LICENCE_DRAFT_NOTICE },
  "licence-changed": { tone: "error", text: "The licence text has changed since this page loaded. Read it again before signing." },
  "licence-warranties": { tone: "error", text: "Please tick all three promises to sign." },
  submitted: { tone: "ok", text: "Submitted. The Akana team will be in touch." },
  "file-added": { tone: "ok", text: "File uploaded." },
  "file-missing": { tone: "error", text: "Please upload the file first, then press the button." },
  withdrawn: { tone: "ok", text: "Submission withdrawn." },
  invited: { tone: "ok", text: "Invitation sent." },
  resent: { tone: "ok", text: "Invitation sent again with a new link." },
  revoked: { tone: "ok", text: "Invitation cancelled. The link no longer works." },
  "role-changed": { tone: "ok", text: "Role changed." },
  removed: { tone: "ok", text: "Member removed. Their access ended straight away." },
  "already-member": { tone: "error", text: "That address is already a member." },
  "owner-staff": { tone: "error", text: "Ownership changes are made by Akana staff. Contact us." },
  "rate-limited": { tone: "error", text: "That's the limit for today. Please try again tomorrow." },
  invalid: { tone: "error", text: "Please check the form. Nothing changed." },
  denied: { tone: "error", text: "Your role cannot do that. Nothing changed." },
  failed: { tone: "error", text: "That didn't work just now. Nothing changed. Please try again." },
} as const;
export type StudioNotice = keyof typeof STUDIO_NOTICES;

export function studioNotice(code: string | string[] | undefined): { tone: "ok" | "error"; text: string } | null {
  const c = Array.isArray(code) ? code[0] : code;
  return c && c in STUDIO_NOTICES ? STUDIO_NOTICES[c as StudioNotice] : null;
}

/** Maps a 0013 error code (and a few Postgres ones) to a notice. */
export function studioErrorNotice(code: string | undefined, message?: string): StudioNotice {
  switch (code) {
    case "AKS01":
    case "42501":
      return message && /owner/i.test(message) && /staff/i.test(message) ? "owner-staff" : "denied";
    case "AKS02":
    case "23514":
      return message && /isbn/i.test(message) ? "isbn-invalid" : "invalid";
    case "AKS05":
      return message && /isbn/i.test(message) ? "isbn-taken" : "already-member";
    case "AKS06":
      return "licence-draft";
    case "AKS08":
      return message && /does not match/i.test(message) ? "licence-changed" : "failed";
    case "AKS29":
      return "rate-limited";
    case "23505":
      return "failed";
    default:
      return "failed";
  }
}

// ---------------------------------------------------------------------------
// Invitation link page
// ---------------------------------------------------------------------------

export type InviteState = "ok" | "unknown" | "expired" | "used" | "revoked";

export function inviteLinkCopy(state: Exclude<InviteState, "ok">): { title: string; body: string } {
  switch (state) {
    case "expired":
      return { title: "This invitation has expired", body: "Ask the person who invited you to send a new one." };
    case "used":
      return { title: "This invitation has been used", body: "If it was you, sign in and open the Studio." };
    case "revoked":
      return { title: "This invitation was cancelled", body: "Ask the person who invited you if you think this is a mistake." };
    default:
      return { title: "This link isn't working", body: "It may have been copied only in part. Try the link in the email again." };
  }
}

export function joinUrl(origin: string, token: string): string {
  return `${origin}/studio/join/${token}`;
}

/** Build a link that keeps the chosen organisation. */
export function withOrg(path: string, orgId: string | null | undefined, multi: boolean): string {
  if (!orgId || !multi) return path;
  return `${path}${path.includes("?") ? "&" : "?"}org=${orgId}`;
}

/** True when an ISO time is in the past. */
export function isPast(iso: string, now: number = Date.now()): boolean {
  return new Date(iso).getTime() <= now;
}
