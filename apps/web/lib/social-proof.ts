/**
 * True social proof (5.12), as pure helpers.
 *
 * Only real counts, and only above a threshold set in public.app_config
 * (social_proof_min, 100). The database computes and holds the counts
 * (migration 0055, public.social_proof_counts) and only keeps a row that is
 * above the threshold. This module is the second lock: it checks the number
 * again, refuses a count that has gone stale, and rounds down to the nearest
 * hundred so the page never says more than is true. Nothing is invented and
 * nothing is shown for a wellbeing title (the database never holds one).
 */

export const DEFAULT_PROOF_MIN = 100;
export const DEFAULT_PROOF_TTL_HOURS = 26;

export interface ProofRow {
  scope: "readers_started" | "readers_total";
  workbook_id: string | null;
  readers: number;
  computed_at: string;
}

export function proofMinFrom(rows: readonly { key: string; value: unknown }[] | null | undefined): number {
  const n = Number((rows ?? []).find((r) => r.key === "social_proof_min")?.value);
  return Number.isInteger(n) && n >= DEFAULT_PROOF_MIN ? n : DEFAULT_PROOF_MIN;
}

export function proofTtlHoursFrom(rows: readonly { key: string; value: unknown }[] | null | undefined): number {
  const n = Number((rows ?? []).find((r) => r.key === "social_proof_ttl_hours")?.value);
  return Number.isInteger(n) && n >= 1 && n <= 24 * 14 ? n : DEFAULT_PROOF_TTL_HOURS;
}

/** The count to say: rounded down to the nearest hundred, or null at or below the threshold. */
export function proofFloor(readers: number, min: number): number | null {
  if (!Number.isFinite(readers) || !Number.isInteger(readers)) return null;
  const floor = Math.floor(readers / 100) * 100;
  return readers > Math.max(min, DEFAULT_PROOF_MIN) && floor > 0 ? floor : null;
}

function fresh(row: ProofRow, now: Date, ttlHours: number): boolean {
  const t = Date.parse(row.computed_at);
  return Number.isFinite(t) && now.getTime() - t <= ttlHours * 3_600_000 && t <= now.getTime() + 60_000;
}

export function proofNumber(n: number): string {
  return new Intl.NumberFormat("en-GB").format(n);
}

/** The line for one workbook page, or null. */
export function workbookProofLine(rows: readonly ProofRow[] | null | undefined, workbookId: string, opts: { now: Date; min: number; ttlHours: number }): string | null {
  const row = (rows ?? []).find((r) => r.scope === "readers_started" && r.workbook_id === workbookId);
  if (!row || !fresh(row, opts.now, opts.ttlHours)) return null;
  const n = proofFloor(row.readers, opts.min);
  return n === null ? null : `More than ${proofNumber(n)} readers have started this workbook.`;
}

/** The line for the front of the site, or null. */
export function siteProofLine(rows: readonly ProofRow[] | null | undefined, opts: { now: Date; min: number; ttlHours: number }): string | null {
  const row = (rows ?? []).find((r) => r.scope === "readers_total" && r.workbook_id === null);
  if (!row || !fresh(row, opts.now, opts.ttlHours)) return null;
  const n = proofFloor(row.readers, opts.min);
  return n === null ? null : `More than ${proofNumber(n)} readers use Akana.`;
}
