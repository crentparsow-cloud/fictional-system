/**
 * Lead helpers for /admin/leads (F-001). Pure: no Next, no Supabase.
 */

export const LEAD_STATUSES = ["new", "contacted", "closed"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  closed: "Closed",
};

export function isLeadStatus(v: unknown): v is LeadStatus {
  return typeof v === "string" && (LEAD_STATUSES as readonly string[]).includes(v);
}

/** The status filter from the URL. Anything unknown means all leads. */
export function parseLeadStatusFilter(raw: string | string[] | undefined): LeadStatus | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return isLeadStatus(v) ? v : null;
}

/** The statuses a lead may move to from where it is. Any move is allowed, but not to itself. */
export function leadStatusTargets(current: string): LeadStatus[] {
  return LEAD_STATUSES.filter((s) => s !== current);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

export interface LeadStatusChange {
  id: string;
  status: LeadStatus;
}

/** Read a status change from a submitted form. Returns null when either value is wrong. */
export function parseLeadStatusChange(get: (name: string) => unknown): LeadStatusChange | null {
  const id = get("id");
  const status = get("status");
  if (!isUuid(id) || !isLeadStatus(status)) return null;
  return { id: id.toLowerCase(), status };
}

/** A mailto link for a lead's email address, or null when it does not look like one. */
export function mailtoHref(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const e = email.trim();
  if (!/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(e)) return null;
  return `mailto:${e}`;
}

/** A short date for admin tables, in UK form: 7 Oct 2026. */
export function formatAdminDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" }).format(d);
}
