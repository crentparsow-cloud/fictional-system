import "server-only";
import type { WorkbookV3 } from "@akana/schema";
import { rebuildWorkbook, type SectionRow } from "@/lib/rebuild-workbook";
import { createUserClient } from "@/lib/supabase/server";
import { tenantIdForRequest } from "@/lib/tenant-id";

export type SampleExercise = { exercise: WorkbookV3["exercises"][number]; toolkitTitles: string[]; unitLabel: string };

/**
 * The first exercise of unit 1, for the "try it here" block on the workbook
 * page (3.1). Read through the visitor's own client, so row level security
 * decides what is visible: only the free sections of a public title. A
 * wellbeing title gives nothing, because consent to keep health information
 * needs an account (the same rule as /try). Any failure gives null and the
 * block is left out.
 */
export async function loadSampleExercise(slug: string, safetyTier: string): Promise<SampleExercise | null> {
  if (safetyTier !== "none") return null;
  try {
    const tenantId = await tenantIdForRequest();
    if (!tenantId) return null;
    const supabase = await createUserClient();
    const { data } = await supabase.from("workbooks").select("tenant_id, current_version_id").eq("slug", slug).maybeSingle();
    const wb = data as { tenant_id: string; current_version_id: string | null } | null;
    if (!wb?.current_version_id || wb.tenant_id !== tenantId) return null;
    const { data: rows } = await supabase.from("workbook_sections").select("kind, unit_number, body, free").eq("version_id", wb.current_version_id);
    const built = rebuildWorkbook((rows ?? []) as SectionRow[]);
    if (!built || built.lockedUnits.includes(1)) return null;
    const unit = built.workbook.units.find((u) => u.number === 1);
    const exercise = unit ? built.workbook.exercises.find((e) => e.id === unit.exercise_ids[0]) : undefined;
    if (!exercise || exercise.fields.length === 0) return null;
    return { exercise, toolkitTitles: built.workbook.toolkit.map((t) => t.title), unitLabel: built.workbook.structure.unit };
  } catch {
    return null;
  }
}
