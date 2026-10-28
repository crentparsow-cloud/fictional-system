"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { WorkbookV3, contentHash } from "@akana/schema";
import { checkIdStability } from "@akana/validate";
import { runValidator } from "@/lib/admin/review";
import { isUuid } from "@/lib/author-release";
import { requireRoleMfa } from "@/lib/mfa/role-mfa-server";
import { applyBuilderModel, checkBuilderModel, friendlyPath, parseBuilderModel } from "@/lib/studio-builder";
import type { BuilderState } from "@/lib/studio-builder-state";
import { roleCan, withOrg } from "@/lib/studio";
import { requireStudio } from "@/lib/studio-server";
import { createUserClient } from "@/lib/supabase/server";
import { countEvent } from "@/lib/funnel-server";

/**
 * The workbook builder's two buttons (build list 8.2). Check runs the same
 * steps as Save and stores nothing. Save makes a new, unpublished version
 * through public.studio_save_draft_version (0057), which checks the role, the
 * content hash and that Akana's own lines are unchanged. The saved draft then
 * goes through the usual preview, sign-off and release. Reader answers are
 * never read here.
 */

const SHOWN = 60;

export async function runBuilder(_prev: BuilderState, fd: FormData): Promise<BuilderState> {
  const workbookId = fd.get("workbook");
  const baseId = fd.get("base");
  const orgRaw = fd.get("org");
  const org = typeof orgRaw === "string" && isUuid(orgRaw) ? orgRaw : undefined;
  const intent = fd.get("intent") === "save" ? "save" : "check";
  const fail = (message: string): BuilderState => ({ status: "error", message, issues: [], errors: [], warnings: [] });
  if (!isUuid(workbookId) || !isUuid(baseId)) return fail("That request was not valid.");

  const path = `/studio/workbooks/${workbookId}/build`;
  const ctx = await requireStudio(path, org);
  await requireRoleMfa(ctx.org.role, withOrg(path, org, Boolean(org)));
  if (!roleCan(ctx.org.role).writeWorkbooks) return fail("Owners, editors and authors in your organisation build workbooks.");

  const parsed = parseBuilderModel(fd.get("model"));
  if (!parsed.ok) return fail(parsed.message);

  const supabase = await createUserClient();
  const { data: row } = await supabase.from("workbook_versions").select("id, workbook_id, content, published_at").eq("id", baseId).maybeSingle();
  const base = row as { id: string; workbook_id: string; content: Record<string, unknown>; published_at: string | null } | null;
  if (!base || base.workbook_id !== workbookId) return fail("The version you started from could not be found. Reload the page.");

  const kind = typeof (base.content.structure as { unit?: unknown } | undefined)?.unit === "string" ? String((base.content.structure as { unit: string }).unit) : "week";
  const issues = checkBuilderModel(parsed.model, base.content);
  if (issues.length) {
    return { status: "error", message: `${issues.length} thing${issues.length === 1 ? "" : "s"} to fix before this can be checked.`, issues: issues.slice(0, SHOWN), errors: [], warnings: [] };
  }

  const next = applyBuilderModel(base.content, parsed.model);
  const result = runValidator(next);
  const errors = result.errors.map((f) => ({ where: friendlyPath(f.path, kind, next), message: f.message }));
  const warnings = result.warnings.map((f) => ({ where: friendlyPath(f.path, kind, next), message: f.message }));

  // Once a version is live, ids may not be removed or reused (F-110).
  if (base.published_at) {
    const a = WorkbookV3.safeParse(base.content);
    const b = WorkbookV3.safeParse(next);
    if (a.success && b.success) {
      for (const f of checkIdStability(a.data, b.data)) errors.push({ where: friendlyPath(f.path, kind, next), message: f.message });
    }
  }
  if (errors.length) {
    return {
      status: "error",
      message: `The checks found ${errors.length} problem${errors.length === 1 ? "" : "s"}. Nothing was saved.`,
      issues: [],
      errors: errors.slice(0, SHOWN),
      warnings: warnings.slice(0, SHOWN),
    };
  }
  if (intent === "check") {
    return { status: "checked", message: "The checks pass. You can save this as a draft.", issues: [], errors: [], warnings: warnings.slice(0, SHOWN) };
  }

  const { data, error } = await supabase.rpc("studio_save_draft_version", {
    p_workbook: workbookId,
    p_base: baseId,
    p_content: next,
    p_content_hash: contentHash(next),
    p_errors: 0,
    p_warnings: warnings.length,
  });
  if (error) {
    console.error("studio_builder_save_failed", error.code ?? "");
    const m = error.message ?? "";
    if (/nothing changed/i.test(m)) return fail("Nothing changed, so no new version was made.");
    if (error.code === "AKZ22") return fail("Someone saved a newer version while you were working. Reload the page to start from it. Copy anything you want to keep first.");
    if (error.code === "AKZ23") return fail("Part of what you changed belongs to Akana (safety lines, badge or the internal block). It was not saved.");
    if (error.code === "AKZ21" || error.code === "42501") return fail("Your role cannot change this workbook.");
    return fail("The draft did not save. Try again.");
  }
  const saved = (Array.isArray(data) ? data[0] : data) as { version_id?: string } | null;
  if (!saved?.version_id) return fail("The draft did not save. Try again.");
  await countEvent("builder_saved");
  revalidatePath(`/studio/workbooks/${workbookId}`);
  const back = withOrg(`/studio/workbooks/${workbookId}`, org, Boolean(org));
  redirect(`${back}${back.includes("?") ? "&" : "?"}notice=built`);
}
