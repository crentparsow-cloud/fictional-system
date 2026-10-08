/**
 * Account and data rights (F-025). Pure helpers for the You tab: what the
 * reader's deletion request means right now, and the words for its date.
 * The row comes from public.account_deletion_requests under RLS.
 */

export interface DeletionRow {
  requested_at: string;
  cancel_before: string;
  cancelled_at: string | null;
  completed_at: string | null;
}

export type DeletionState =
  /** No request, or a cancelled one: the reader can ask. */
  | { kind: "none" }
  /** Asked, inside the 7 days: show the date and "Cancel deletion". */
  | { kind: "pending"; requestedAt: string; deletesOn: string }
  /** The 7 days are over and the job has not run yet. Too late to cancel. */
  | { kind: "due"; deletesOn: string }
  /** Done. The reader should not normally be signed in to see this. */
  | { kind: "completed"; completedAt: string };

export function deletionState(row: DeletionRow | null | undefined, now: Date): DeletionState {
  if (!row) return { kind: "none" };
  if (row.completed_at) return { kind: "completed", completedAt: row.completed_at };
  if (row.cancelled_at) return { kind: "none" };
  const cancelBefore = new Date(row.cancel_before);
  if (Number.isNaN(cancelBefore.getTime())) return { kind: "none" };
  if (cancelBefore.getTime() > now.getTime()) return { kind: "pending", requestedAt: row.requested_at, deletesOn: row.cancel_before };
  return { kind: "due", deletesOn: row.cancel_before };
}

/** "14 October 2026", in UK time. */
export function longDate(iso: string, locale: string = "en-GB"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" }).format(d);
}

/** The typed confirmation the old app used: the word DELETE, any case. */
export function isDeleteConfirmed(typed: unknown): boolean {
  return typeof typed === "string" && typed.trim().toUpperCase() === "DELETE";
}

/** Notices the You tab shows after an action. Unknown values show nothing. */
export const YOU_NOTICES = {
  "deletion-requested": "Your account will be deleted on the date below. You can undo it until then.",
  "deletion-cancelled": "Deletion cancelled. Your account is back to normal.",
  "deletion-confirm": "Please type DELETE to confirm.",
  "deletion-failed": "Could not schedule the deletion. Please try again.",
  "cancel-failed": "There is no deletion to undo.",
  "consent-withdrawn": "Health data consent withdrawn. You can no longer add to wellbeing workbooks. What you have written stays until you delete it.",
  "consent-failed": "Withdrawing health data consent is not available right now. Please try again later.",
  "faith-consent-withdrawn": "Faith consent withdrawn. You can no longer add to faith workbooks. What you have written stays until you delete it.",
  "faith-consent-failed": "Withdrawing faith consent is not available right now. Please try again later.",
} as const;

export type YouNotice = keyof typeof YOU_NOTICES;

export function noticeText(code: string | string[] | undefined): string | null {
  const c = Array.isArray(code) ? code[0] : code;
  return c && c in YOU_NOTICES ? YOU_NOTICES[c as YouNotice] : null;
}

/**
 * Read only while a deletion is asked for and not yet done (F-025): the
 * reader can open and download their work but not add to it. The answers
 * and progress routes refuse writes in the same state (0026).
 */
export function isReadOnly(state: DeletionState): boolean {
  return state.kind === "pending" || state.kind === "due";
}

/** The banner's words, or null when the account is not read only. */
export function readOnlyBanner(state: DeletionState): { title: string; body: string } | null {
  if (state.kind === "pending") {
    return {
      title: `Your account will be deleted on ${longDate(state.deletesOn)}.`,
      body: "Until then your work is read only. You can still open and download it. To keep your account, cancel the deletion on You.",
    };
  }
  if (state.kind === "due") {
    return { title: "Your account is being deleted.", body: "Your work is read only. You can still download it until the deletion runs." };
  }
  return null;
}
