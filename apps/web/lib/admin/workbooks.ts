/**
 * Kill switch helpers for /admin/workbooks (F-083). Pure.
 *
 * Pause moves a live workbook to paused. app.workbook_is_public needs status
 * live, so a paused workbook leaves sale and the public library at once.
 * Resume moves it back to live. No other status changes happen here. Both go
 * through public.set_workbook_paused (migration 0008), which writes the
 * audit row.
 */

export type WorkbookStatus = "draft" | "in_review" | "approved" | "live" | "paused" | "retired";
export type KillSwitchAction = "pause" | "resume";

export const WORKBOOK_STATUS_LABELS: Record<WorkbookStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
  live: "Live",
  paused: "Paused",
  retired: "Retired",
};

export const BADGE_LABELS: Record<string, string> = {
  official: "Official",
  made_with_author: "Made with the author",
  public_domain: "Public domain",
  demo: "Demo",
};

export function workbookStatusLabel(status: string): string {
  return (WORKBOOK_STATUS_LABELS as Record<string, string>)[status] ?? status;
}

/** The kill switch action offered for a workbook in this status, if any. */
export function killSwitchAction(status: string): KillSwitchAction | null {
  if (status === "live") return "pause";
  if (status === "paused") return "resume";
  return null;
}

/** The status a kill switch action moves to, from a given status. Null when the move is not allowed. */
export function killSwitchTarget(action: KillSwitchAction, current: string): "paused" | "live" | null {
  if (action === "pause" && current === "live") return "paused";
  if (action === "resume" && current === "paused") return "live";
  return null;
}

export function isKillSwitchAction(v: unknown): v is KillSwitchAction {
  return v === "pause" || v === "resume";
}

const CODE = /^AK-[0-9A-HJKMNP-TV-Z]{5}$/;

/** Normalise a workbook code from a form or URL. Returns null when it is not an AK code. */
export function parseWorkbookCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toUpperCase();
  return CODE.test(v) ? v : null;
}

/** Matches the limit in public.set_workbook_paused (0008). */
export const PAUSE_REASON_MAX = 500;

/**
 * Pause and resume both need a reason (F-083). It goes into the audit log
 * with the change. Returns the trimmed reason, or an error. The action is
 * kept in the signature so callers read the same either way.
 */
export function parsePauseReason(action: KillSwitchAction, raw: unknown): { ok: true; reason: string } | { ok: false } {
  void action;
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v || v.length > PAUSE_REASON_MAX) return { ok: false };
  return { ok: true, reason: v };
}

/** How a refusal from public.set_workbook_paused maps to an admin notice. */
export function killSwitchErrorNotice(code: string | null | undefined): "denied" | "stale" | "reason" | "invalid" | "failed" {
  switch (code) {
    case "42501": // insufficient_privilege
      return "denied";
    case "55000": // object_not_in_prerequisite_state: not live or not paused any more
      return "stale";
    case "23514": // check_violation: reason missing or too long
      return "reason";
    case "P0002": // no_data_found
    case "22023": // invalid_parameter_value
      return "invalid";
    default:
      return "failed";
  }
}

export interface WorkbookRow {
  id: string;
  code: string;
  title: string;
  status: string;
  badge: string;
  is_demo: boolean;
}

/** The search box value from the URL, trimmed and capped. */
export function parseWorkbookSearch(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return (v ?? "").trim().slice(0, 100);
}

/** Search by code or title, case-insensitive, as a plain substring. Empty query keeps every row. */
export function filterWorkbooks<T extends Pick<WorkbookRow, "code" | "title">>(rows: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...rows];
  return rows.filter((r) => r.code.toLowerCase().includes(q) || r.title.toLowerCase().includes(q));
}
