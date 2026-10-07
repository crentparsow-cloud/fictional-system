/**
 * Akana for organisations, the manual-sales pilot (F-201 to F-204). Pure
 * helpers shared by /admin/business, the organisation console at /org and
 * the seat invitation page. Migration 0024 holds the rules; these only
 * parse forms and choose words. No prices anywhere: they are proposals
 * until Crent sets them (N2), and the invoice is raised outside the app.
 */

export const CUSTOMER_ORG_KINDS = ["business", "church", "charity", "community_group"] as const;
export type CustomerOrgKind = (typeof CUSTOMER_ORG_KINDS)[number];

export const CUSTOMER_KIND_LABELS: Record<CustomerOrgKind, string> = {
  business: "Business",
  church: "Church",
  charity: "Charity",
  community_group: "Community group",
};

export function isCustomerKind(v: unknown): v is CustomerOrgKind {
  return typeof v === "string" && (CUSTOMER_ORG_KINDS as readonly string[]).includes(v);
}

export const SIZE_BANDS = ["under_10", "10_49", "50_249", "250_999", "1000_plus"] as const;
export type SizeBand = (typeof SIZE_BANDS)[number];
export const SIZE_BAND_LABELS: Record<SizeBand, string> = {
  under_10: "Under 10 people",
  "10_49": "10 to 49",
  "50_249": "50 to 249",
  "250_999": "250 to 999",
  "1000_plus": "1,000 or more",
};

export const LICENCE_KINDS = ["teams", "church", "group", "pilot"] as const;
export type LicenceKind = (typeof LICENCE_KINDS)[number];
export const LICENCE_KIND_LABELS: Record<LicenceKind, string> = {
  teams: "Teams",
  church: "Church",
  group: "Group",
  pilot: "Pilot (free)",
};

export const TITLE_SCOPES = ["membership", "list"] as const;
export type TitleScope = (typeof TITLE_SCOPES)[number];
export const TITLE_SCOPE_LABELS: Record<TitleScope, string> = {
  membership: "Every title in the membership",
  list: "Chosen titles only",
};

export const LICENCE_STATUS_LABELS: Record<string, string> = {
  active: "Active",
  suspended: "Suspended",
  ended: "Ended",
};

export function labelOf(map: Record<string, string>, key: string | null | undefined): string {
  if (!key) return "";
  return map[key] ?? key;
}

/** The privacy line on the console and the invitation page (akana-business.md 2.6, as built for the pilot). */
export function orgPrivacyLine(brandName: string): string {
  return `Your organisation can see how many people have started, never who wrote what. Answers are sealed. No one at your organisation, the author or ${brandName} staff can read them.`;
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

type Get = (name: string) => unknown;
const text = (get: Get, k: string, max: number) => {
  const v = get(k);
  return typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max + 1) : "";
};

/** A URL slug from a display name, matching the organisations.slug check. */
export function slugFor(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

export interface CustomerOrgInput {
  kind: CustomerOrgKind;
  display_name: string;
  legal_name: string;
  country: string;
  slug: string;
  size_band: SizeBand | null;
  sector: string | null;
  charity_number: string | null;
  vat_number: string | null;
  billing_name: string | null;
  billing_email: string | null;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; field: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseCustomerOrgForm(get: Get): Parsed<CustomerOrgInput> {
  const kind = text(get, "kind", 40);
  const display = text(get, "display_name", 200);
  const legal = text(get, "legal_name", 300);
  const country = text(get, "country", 2).toUpperCase();
  const size = text(get, "size_band", 20);
  const sector = text(get, "sector", 80);
  const charity = text(get, "charity_number", 20);
  const vat = text(get, "vat_number", 20).replace(/\s+/g, "").toUpperCase();
  const billingName = text(get, "billing_name", 120);
  const billingEmail = text(get, "billing_email", 254).toLowerCase();

  if (!isCustomerKind(kind)) return { ok: false, field: "kind" };
  if (!display || display.length > 200) return { ok: false, field: "display_name" };
  if (!legal || legal.length > 300) return { ok: false, field: "legal_name" };
  if (!/^[A-Z]{2}$/.test(country)) return { ok: false, field: "country" };
  if (size && !(SIZE_BANDS as readonly string[]).includes(size)) return { ok: false, field: "size_band" };
  if (sector.length > 80 || /[<>]/.test(sector)) return { ok: false, field: "sector" };
  if (charity && !/^[A-Za-z0-9 -]{3,20}$/.test(charity)) return { ok: false, field: "charity_number" };
  if (vat && !/^[A-Z]{2}[A-Z0-9]{2,13}$/.test(vat)) return { ok: false, field: "vat_number" };
  if (billingName.length > 120 || /[<>]/.test(billingName)) return { ok: false, field: "billing_name" };
  if (billingEmail && (billingEmail.length > 254 || !EMAIL.test(billingEmail))) return { ok: false, field: "billing_email" };
  const slug = slugFor(display);
  if (!slug) return { ok: false, field: "display_name" };

  return {
    ok: true,
    value: {
      kind,
      display_name: display,
      legal_name: legal,
      country,
      slug,
      size_band: size ? (size as SizeBand) : null,
      sector: sector || null,
      charity_number: charity || null,
      vat_number: vat || null,
      billing_name: billingName || null,
      billing_email: billingEmail || null,
    },
  };
}

export interface LicenceInput {
  kind: LicenceKind;
  title_scope: TitleScope;
  seats: number;
  starts_at: string;
  ends_at: string;
  invoice_ref: string | null;
  titles: string[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A yyyy-mm-dd date from a date input, as midnight UTC. Null when it is not a real date. */
export function dateInputToIso(v: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return null;
  return d.toISOString();
}

/** The date part of an ISO time, for a date input's value. */
export function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

export function parseSeats(v: unknown): number | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!/^\d{1,5}$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= 10000 ? n : null;
}

export function parseInvoiceRef(v: unknown): string | null | false {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  return /^[A-Za-z0-9][A-Za-z0-9 ./_-]{0,59}$/.test(s) ? s : false;
}

/** Workbook ids from a form's checkboxes. */
export function parseTitleIds(values: unknown[]): string[] | null {
  const out: string[] = [];
  for (const v of values) {
    if (typeof v !== "string" || !UUID.test(v)) return null;
    if (!out.includes(v)) out.push(v);
  }
  return out.length > 200 ? null : out;
}

export function parseLicenceForm(get: Get, getAll: (name: string) => unknown[]): Parsed<LicenceInput> {
  const kind = text(get, "kind", 20);
  const scope = text(get, "title_scope", 20);
  const seats = parseSeats(get("seats"));
  const starts = dateInputToIso(text(get, "starts_on", 10));
  const ends = dateInputToIso(text(get, "ends_on", 10));
  const ref = parseInvoiceRef(get("invoice_ref"));
  const titles = parseTitleIds(getAll("titles"));

  if (!(LICENCE_KINDS as readonly string[]).includes(kind)) return { ok: false, field: "kind" };
  if (!(TITLE_SCOPES as readonly string[]).includes(scope)) return { ok: false, field: "title_scope" };
  if (seats === null) return { ok: false, field: "seats" };
  if (!starts) return { ok: false, field: "starts_on" };
  if (!ends || ends <= starts) return { ok: false, field: "ends_on" };
  if (ref === false) return { ok: false, field: "invoice_ref" };
  if (titles === null) return { ok: false, field: "titles" };
  if (scope === "list" && titles.length === 0) return { ok: false, field: "titles" };
  return {
    ok: true,
    value: {
      kind: kind as LicenceKind,
      title_scope: scope as TitleScope,
      seats,
      starts_at: starts,
      ends_at: ends,
      invoice_ref: ref,
      titles: scope === "list" ? titles : [],
    },
  };
}

/** One address from the invite form. */
export function cleanInviteEmail(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return s.length >= 3 && s.length <= 254 && EMAIL.test(s) ? s : null;
}

// ---------------------------------------------------------------------------
// Counts
// ---------------------------------------------------------------------------

export type StartedShown = "exact" | "at_least" | "fewer_than" | "hidden";

/** How the console shows "people started" (0024 app.org_seat_summary). Never a number the database held back. */
export function startedText(shown: string | null | undefined, value: number | null | undefined, threshold: number): string {
  switch (shown) {
    case "exact":
      return typeof value === "number" ? String(value) : "Not shown";
    case "at_least":
      return typeof value === "number" ? `At least ${value}` : "Not shown";
    case "fewer_than":
      return `Fewer than ${threshold}`;
    default:
      return "Not shown while numbers are small";
  }
}

// ---------------------------------------------------------------------------
// Links and notices
// ---------------------------------------------------------------------------

export function seatJoinUrl(origin: string, token: string): string {
  return `${origin}/org/join/${token}`;
}

export function adminJoinUrl(origin: string, token: string): string {
  return `${origin}/org/admin-join/${token}`;
}

export type SeatLinkState = "ok" | "unknown" | "expired" | "used" | "revoked" | "declined" | "closed";

export function seatLinkCopy(state: Exclude<SeatLinkState, "ok">): { title: string; body: string } {
  switch (state) {
    case "expired":
      return { title: "This invitation has expired", body: "Ask the person who invited you to send a new one." };
    case "used":
      return { title: "This invitation has been used", body: "If it was you, sign in and go to your library." };
    case "revoked":
      return { title: "This invitation was cancelled", body: "Ask the person who invited you if you think this is a mistake." };
    case "declined":
      return { title: "You said no to this invitation", body: "You won't get another one from this organisation." };
    case "closed":
      return { title: "This invitation can't be used now", body: "The organisation's access is paused or has ended. Ask the person who invited you." };
    default:
      return { title: "This link isn't working", body: "It may have been copied only in part. Try the link in the email again." };
  }
}

export const ORG_NOTICES = {
  created: { tone: "ok", text: "Organisation created." },
  saved: { tone: "ok", text: "Saved." },
  licence_created: { tone: "ok", text: "Licence recorded." },
  licence_saved: { tone: "ok", text: "Licence updated." },
  titles_saved: { tone: "ok", text: "Titles updated." },
  invited: { tone: "ok", text: "Invitation sent." },
  invited_no_mail: { tone: "error", text: "The invitation was saved but the email did not send. Use Send again." },
  resent: { tone: "ok", text: "Invitation sent again with a new link." },
  revoked: { tone: "ok", text: "Invitation cancelled. Its place is free again." },
  released: { tone: "ok", text: "Seat released. The person keeps their account and what they wrote." },
  invalid: { tone: "error", text: "Check the form. Something is missing or does not fit." },
  denied: { tone: "error", text: "Your role cannot do that. Nothing changed." },
  exists: { tone: "error", text: "That already exists. An address with a seat or an open invitation cannot be invited again." },
  no_seats: { tone: "error", text: "No seats left. Cancel an invitation or release a seat first." },
  state: { tone: "error", text: "That cannot be done in the licence's current state. Nothing changed." },
  blocked: { tone: "error", text: "This address asked not to be invited by your organisation." },
  limited: { tone: "error", text: "Too many invitations for now. Try again tomorrow." },
  failed: { tone: "error", text: "That did not save. Try again." },
} as const satisfies Record<string, { tone: "ok" | "error"; text: string }>;
export type OrgNotice = keyof typeof ORG_NOTICES;

export function orgNotice(code: string | string[] | undefined): { tone: "ok" | "error"; text: string } | null {
  const k = Array.isArray(code) ? code[0] : code;
  return k && Object.prototype.hasOwnProperty.call(ORG_NOTICES, k) ? ORG_NOTICES[k as OrgNotice] : null;
}

/** Map a database error code from 0024 (or 0013 for the owner invitation) to a notice. */
export function orgErrorNotice(code: string | undefined): OrgNotice {
  switch (code) {
    case "AKO01":
    case "AKS01":
    case "42501":
      return "denied";
    case "AKO02":
    case "AKS02":
      return "invalid";
    case "AKO05":
    case "AKS05":
      return "exists";
    case "AKO07":
      return "no_seats";
    case "AKO08":
    case "AKS08":
      return "state";
    case "AKO09":
      return "blocked";
    case "AKO29":
    case "AKS29":
      return "limited";
    default:
      return "failed";
  }
}

/** Where a claim error sends the person back to, as a fixed code. */
export function claimErrorCode(code: string | undefined): "adult" | "closed" | "deletion" | "full" | "failed" {
  switch (code) {
    case "AKO10":
      return "adult";
    case "AKO04":
    case "AKO08":
      return "closed";
    case "AKO06":
      return "deletion";
    case "AKO07":
      return "full";
    default:
      return "failed";
  }
}

export const CLAIM_ERRORS: Record<string, string> = {
  adult: "Tick the box to confirm you are 18 or over.",
  closed: "This invitation can no longer be used.",
  deletion: "Your account is set to be deleted, so it can't take a place. Cancel the deletion on the You page first.",
  full: "There are no places left. Ask the person who invited you.",
  failed: "That didn't work just now. Please try again.",
};

export function formatOrgDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" }).format(d);
}

/** True when an ISO time is in the past. */
export function isPastIso(iso: string, now: number = Date.now()): boolean {
  return Date.parse(iso) <= now;
}

/** Default dates for a new licence form: today and a year from today, as yyyy-mm-dd. */
export function defaultLicenceDates(now: number = Date.now()): { start: string; end: string } {
  return { start: new Date(now).toISOString().slice(0, 10), end: new Date(now + 365 * 86_400_000).toISOString().slice(0, 10) };
}
