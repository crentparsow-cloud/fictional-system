/**
 * Staff view of title requests (build list 2.8). Pure helpers for
 * /admin/requests: statuses, filter parsing and grouping the same title
 * together, so the list reads "asked for 7 times" and not seven rows.
 */

export const REQUEST_STATUSES = ["new", "considering", "planned", "declined", "done"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  new: "New",
  considering: "Considering",
  planned: "Planned",
  declined: "Declined",
  done: "Done",
};

export function isRequestStatus(v: unknown): v is RequestStatus {
  return typeof v === "string" && (REQUEST_STATUSES as readonly string[]).includes(v);
}

export function parseRequestFilter(raw: string | string[] | undefined): RequestStatus | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return isRequestStatus(v) ? v : null;
}

export interface RequestRow {
  id: string;
  created_at: string;
  title: string;
  title_key: string;
  author_name: string | null;
  note: string | null;
  status: string;
  staff_note: string | null;
}

export interface RequestGroup {
  key: string;
  /** The wording used most often, else the newest. */
  title: string;
  authors: string[];
  count: number;
  latest: string;
  /** The status shared by every row, or "mixed". */
  status: RequestStatus | "mixed";
  staffNote: string | null;
  notes: string[];
  ids: string[];
}

const MAX_NOTES = 5;

function mostCommon(values: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = values[0] ?? "";
  let n = 0;
  for (const [v, c] of counts) {
    if (c > n) {
      best = v;
      n = c;
    }
  }
  return best;
}

/** Groups rows by title key. Most asked first, then newest. */
export function groupRequests(rows: readonly RequestRow[]): RequestGroup[] {
  const byKey = new Map<string, RequestRow[]>();
  for (const r of rows) {
    const list = byKey.get(r.title_key) ?? [];
    list.push(r);
    byKey.set(r.title_key, list);
  }
  const groups: RequestGroup[] = [];
  for (const [key, list] of byKey) {
    const sorted = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
    const newest = sorted[0];
    if (!newest) continue;
    const statuses = new Set(sorted.map((r) => r.status));
    const only = statuses.size === 1 ? [...statuses][0] : null;
    const authors = [...new Set(sorted.map((r) => r.author_name?.trim()).filter((a): a is string => Boolean(a)))];
    groups.push({
      key,
      title: mostCommon(sorted.map((r) => r.title)),
      authors,
      count: sorted.length,
      latest: newest.created_at,
      status: only && isRequestStatus(only) ? only : "mixed",
      staffNote: sorted.find((r) => r.staff_note)?.staff_note ?? null,
      notes: sorted.map((r) => r.note?.trim()).filter((n): n is string => Boolean(n)).slice(0, MAX_NOTES),
      ids: sorted.map((r) => r.id),
    });
  }
  return groups.sort((a, b) => b.count - a.count || b.latest.localeCompare(a.latest) || a.key.localeCompare(b.key));
}
