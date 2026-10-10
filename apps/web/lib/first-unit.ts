import { Exercise, ProgrammeUnit } from "@akana/schema";
import { z } from "zod";

/**
 * Policy 7.9: a title shows in the library, Explore and the Theme pages
 * only when its first unit is complete. "Complete" is defined from the
 * schema, not by hand: the unit 1 section app.publish_version() wrote
 * (migration 0002) must parse as a v3 ProgrammeUnit whose exercises are
 * all present and each parse as a v3 Exercise. A title with no published
 * version has no unit 1 and fails for that reason.
 *
 * The check runs in the query layer (lib/catalogue.ts) on the unit 1 rows,
 * which are free and so readable by anyone for a public title. Staff see the
 * reason on /admin/workbooks; the public pages see nothing of a title that
 * fails.
 */

/** The unit 1 section body: the unit object plus its resolved exercises, in exercise_ids order. */
const PublishedUnit = ProgrammeUnit.extend({ exercises: z.array(Exercise).min(1) }).strict();

export type FirstUnitGap = { complete: true } | { complete: false; reason: string };

export const NO_VERSION_REASON = "No published version, so no first unit";
export const NO_UNIT_ROW_REASON = "The published version has no unit 1";

/**
 * Whether a unit 1 section body is complete, with a plain reason when it is
 * not. The body is the row's `body` column; `undefined` means no row.
 */
export function firstUnitGap(body: unknown): FirstUnitGap {
  if (body === undefined) return { complete: false, reason: NO_UNIT_ROW_REASON };
  const parsed = PublishedUnit.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.length ? issue.path.join(".") : "unit 1";
    return { complete: false, reason: `Unit 1 is incomplete: ${path} ${issue?.message ?? "is invalid"}`.trim() };
  }
  const unit = parsed.data;
  if (unit.number !== 1) return { complete: false, reason: `Unit 1 row carries number ${unit.number}` };
  if (!unit.focus.trim()) return { complete: false, reason: "Unit 1 has no focus line" };
  const ids = new Set(unit.exercises.map((e) => e.id));
  const missing = unit.exercise_ids.filter((id) => !ids.has(id));
  if (missing.length) return { complete: false, reason: `Unit 1 names exercises that are not in the version: ${missing.join(", ")}` };
  return { complete: true };
}

/**
 * The gap for each workbook from its current version and the unit 1 rows
 * the caller read. Keyed by workbook id. A workbook with no current version
 * fails with NO_VERSION_REASON; one whose version has no unit 1 row fails
 * with NO_UNIT_ROW_REASON.
 */
export function firstUnitGaps(
  workbooks: readonly { id: string; current_version_id: string | null }[],
  unitRows: readonly { version_id: string; body: unknown }[],
): Map<string, FirstUnitGap> {
  const byVersion = new Map(unitRows.map((r) => [r.version_id, r.body]));
  const out = new Map<string, FirstUnitGap>();
  for (const w of workbooks) {
    if (!w.current_version_id) out.set(w.id, { complete: false, reason: NO_VERSION_REASON });
    else out.set(w.id, firstUnitGap(byVersion.get(w.current_version_id)));
  }
  return out;
}
