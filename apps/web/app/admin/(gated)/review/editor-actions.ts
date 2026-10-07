"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { contentHash } from "@akana/schema";
import type { Finding } from "@akana/validate";
import { adminAbilities } from "@/lib/admin/permissions";
import { runValidator } from "@/lib/admin/review";
import { isUuid, parseEditorJson } from "@/lib/author-release";
import { getStaffAccess } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Staff JSON editor (F-086). The validator (@akana/validate) runs here on
 * the server, both while staff type and again on save. A save makes a new
 * version with a new content hash through public.staff_save_version (0020),
 * which refuses errors, unchanged content and a changed code, records the
 * validator result against the new hash and writes the audit row. Owners and
 * editors only; the function checks again.
 */

export interface EditorCheck {
  parseError: string | null;
  ok: boolean;
  errors: Finding[];
  warnings: Finding[];
  errorCount: number;
  warningCount: number;
  hash: string | null;
}

const SHOWN = 100;

async function mayEdit(): Promise<boolean> {
  const access = await getStaffAccess();
  return access.decision === "ok" && adminAbilities(access.session?.roles ?? []).releaseVersions;
}

function check(text: unknown): EditorCheck & { value?: Record<string, unknown> } {
  const parsed = parseEditorJson(text);
  if (!parsed.ok) return { parseError: parsed.message, ok: false, errors: [], warnings: [], errorCount: 0, warningCount: 0, hash: null };
  const r = runValidator(parsed.value);
  return {
    parseError: null,
    ok: r.ok,
    errors: r.errors.slice(0, SHOWN),
    warnings: r.warnings.slice(0, SHOWN),
    errorCount: r.errors.length,
    warningCount: r.warnings.length,
    hash: contentHash(parsed.value),
    value: parsed.value,
  };
}

/** Live validation while staff type. Saves nothing. */
export async function checkWorkbookJson(text: string): Promise<EditorCheck | null> {
  if (!(await mayEdit())) return null;
  const r = check(text);
  return { parseError: r.parseError, ok: r.ok, errors: r.errors, warnings: r.warnings, errorCount: r.errorCount, warningCount: r.warningCount, hash: r.hash };
}

export interface SaveState {
  error: string | null;
}

/** Save the editor content as a new version. Stays on the page with a message when refused, so no work is lost. */
export async function saveWorkbookVersion(_prev: SaveState, fd: FormData): Promise<SaveState> {
  if (!(await mayEdit())) return { error: "Only owners and editors save a version." };
  const workbook = fd.get("workbook");
  const baseRaw = fd.get("base");
  const base = isUuid(baseRaw) ? baseRaw : null;
  if (!isUuid(workbook)) return { error: "That request was not valid." };
  const c = check(fd.get("content"));
  if (c.parseError || !c.value || !c.hash) return { error: c.parseError ?? "The JSON does not parse. Nothing was saved." };
  if (c.errorCount > 0) return { error: `The validator found ${c.errorCount} error${c.errorCount === 1 ? "" : "s"}. Nothing was saved.` };

  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("staff_save_version", {
    p_workbook: workbook,
    p_base: base,
    p_content: c.value,
    p_content_hash: c.hash,
    p_errors: 0,
    p_warnings: c.warningCount,
  });
  if (error) {
    console.error("admin_editor_save_failed", error.code ?? "");
    const m = error.message ?? "";
    if (/nothing changed/i.test(m)) return { error: "Nothing changed, so no new version was made." };
    if (/code in the JSON/i.test(m)) return { error: "The code in the JSON must stay the workbook's own code." };
    if (/latest version/i.test(m)) return { error: "This workbook already has a version. Edit the latest one instead." };
    if (error.code === "42501") return { error: "Only owners and editors save a version." };
    return { error: "The version did not save. Try again." };
  }
  const row = (Array.isArray(data) ? data[0] : data) as { version_id?: string } | null;
  if (!row?.version_id) return { error: "The version did not save. Try again." };
  revalidatePath("/admin/review");
  redirect(`/admin/review/${row.version_id}?notice=version_saved`);
}
