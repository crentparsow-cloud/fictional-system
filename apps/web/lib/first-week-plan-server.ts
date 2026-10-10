import "server-only";
import { firstWeekPlan, type FirstWeekPlan, type OutlineEntry, type UnitKind } from "@/lib/first-week-plan";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

const KINDS: readonly UnitKind[] = ["week", "day", "module", "chapter"];

/**
 * The first week's plan for a reader who has just started a trial (14.20):
 * from the workbook they opened most recently, or null when they have none,
 * it is a wellbeing title, or anything cannot be read. Best effort: the
 * email goes without a plan rather than not at all. Reads with the service
 * role because the email is sent from the webhook, where there is no
 * reader session. Nothing here is logged with a title in it.
 */
export async function loadFirstWeekPlan(admin: Admin, userId: string | null): Promise<FirstWeekPlan | null> {
  if (!userId) return null;
  try {
    const { data: enrolment } = await admin
      .from("enrolments")
      .select("version_id, workbooks(title, short_title, safety_tier, books(title))")
      .eq("user_id", userId)
      .order("last_opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!enrolment) return null;
    const wb = (enrolment as unknown as { workbooks: { title: string; short_title: string | null; safety_tier: "none" | "standard" | "higher"; books: { title: string } | null } | null }).workbooks;
    if (!wb) return null;
    const versionId = (enrolment as { version_id: string }).version_id;

    const { data: sections } = await admin
      .from("workbook_sections")
      .select("kind, unit_number, body")
      .eq("version_id", versionId)
      .in("kind", ["listing", "unit"])
      .or("unit_number.is.null,unit_number.eq.1");
    let unit: UnitKind = "week";
    let outline: OutlineEntry[] = [];
    let stepTitles: string[] = [];
    for (const row of (sections ?? []) as { kind: string; unit_number: number | null; body: unknown }[]) {
      const body = (row.body ?? {}) as Record<string, unknown>;
      if (row.kind === "listing") {
        const structure = (body.structure ?? {}) as { unit?: string };
        if (KINDS.includes(structure.unit as UnitKind)) unit = structure.unit as UnitKind;
        outline = Array.isArray(body.outline) ? (body.outline as OutlineEntry[]).filter((o) => typeof o?.number === "number" && typeof o?.focus === "string") : [];
      } else if (row.unit_number === 1 && Array.isArray(body.exercises)) {
        stepTitles = (body.exercises as { title?: unknown }[]).map((e) => (typeof e?.title === "string" ? e.title : "")).filter(Boolean);
      }
    }
    return firstWeekPlan({
      unit,
      outline,
      stepTitles,
      forbidden: [wb.title, wb.short_title ?? "", wb.books?.title ?? ""],
      safetyTier: wb.safety_tier,
    });
  } catch {
    return null;
  }
}
