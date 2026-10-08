"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { contentHash, type Genre, type SafetyTier } from "@akana/schema";
import { validateGuide, type GuideFinding } from "@akana/validate";
import { adminAbilities } from "@/lib/admin/permissions";
import { isUuid } from "@/lib/author-release";
import { getStaffAccess } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Facilitator guides (F-212). Staff owners and editors write a guide per
 * workbook version. @akana/validate (validateGuide) runs here on save and
 * again before approval; public.facilitator_guide_save, _approve and
 * _withdraw (0028) check the role and write the audit rows. An approved
 * guide never changes; withdraw it and write a new one.
 */

export interface GuideSaveState {
  ok: boolean;
  message: string | null;
  errors: GuideFinding[];
  warnings: GuideFinding[];
}

async function mayEdit(): Promise<boolean> {
  const access = await getStaffAccess();
  return access.decision === "ok" && adminAbilities(access.session?.roles ?? []).releaseVersions;
}

/** The facts the validator needs about a version: genre, tier and its units. */
async function versionFacts(versionId: string): Promise<{ genre: Genre; tier: SafetyTier; units: number[] } | null> {
  const supabase = await createUserClient();
  const { data: v } = await supabase.from("workbook_versions").select("id, workbook_id, content").eq("id", versionId).maybeSingle();
  if (!v) return null;
  const { data: w } = await supabase.from("workbooks").select("genre_id, safety_tier").eq("id", v.workbook_id).maybeSingle();
  if (!w) return null;
  const content = v.content as { units?: { number?: unknown }[] } | null;
  const units = Array.isArray(content?.units) ? content.units.map((u) => u?.number).filter((n): n is number => Number.isInteger(n)) : [];
  return { genre: w.genre_id as Genre, tier: w.safety_tier as SafetyTier, units };
}

export async function saveGuide(_prev: GuideSaveState, fd: FormData): Promise<GuideSaveState> {
  if (!(await mayEdit())) return { ok: false, message: "Owners and editors write guides.", errors: [], warnings: [] };
  const version = String(fd.get("version") ?? "");
  if (!isUuid(version)) return { ok: false, message: "Unknown version.", errors: [], warnings: [] };
  let value: unknown;
  try {
    value = JSON.parse(String(fd.get("text") ?? ""));
  } catch (e) {
    return { ok: false, message: `The JSON does not parse: ${e instanceof Error ? e.message : "unknown error"}`, errors: [], warnings: [] };
  }
  const facts = await versionFacts(version);
  if (!facts) return { ok: false, message: "Unknown version.", errors: [], warnings: [] };
  const r = validateGuide(value, { genre: facts.genre, tier: facts.tier, unitNumbers: facts.units });
  if (!r.ok || !r.guide) return { ok: false, message: "Fix the errors below. Nothing was saved.", errors: r.errors.slice(0, 100), warnings: r.warnings.slice(0, 100) };
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("facilitator_guide_save", { p_version: version, p_content: r.guide, p_hash: contentHash(r.guide) });
  if (error) {
    console.error("facilitator_guide_save_failed", error.code ?? "");
    return {
      ok: false,
      message: error.code === "AKG08" ? "This version has an approved guide. Withdraw it first." : "That did not save. Try again.",
      errors: [],
      warnings: r.warnings,
    };
  }
  revalidatePath(`/admin/guides/${version}`);
  return { ok: true, message: "Draft saved. Approve it when it has been reviewed.", errors: [], warnings: r.warnings };
}

export async function approveGuide(fd: FormData): Promise<void> {
  const version = String(fd.get("version") ?? "");
  const guide = String(fd.get("guide") ?? "");
  const back = `/admin/guides/${version}`;
  if (!(await mayEdit()) || !isUuid(version) || !isUuid(guide) || fd.get("confirm") !== "yes") redirect(`${back}?notice=invalid`);
  const supabase = await createUserClient();
  const { data: g } = await supabase.from("facilitator_guides").select("content").eq("id", guide).maybeSingle();
  const facts = await versionFacts(version);
  if (!g || !facts || !validateGuide(g.content, { genre: facts.genre, tier: facts.tier, unitNumbers: facts.units }).ok) {
    redirect(`${back}?notice=invalid`);
  }
  const { error } = await supabase.rpc("facilitator_guide_approve", { p_guide: guide });
  if (error) {
    console.error("facilitator_guide_approve_failed", error.code ?? "");
    redirect(`${back}?notice=failed`);
  }
  revalidatePath(back);
  redirect(`${back}?notice=approved`);
}

export async function withdrawGuide(fd: FormData): Promise<void> {
  const version = String(fd.get("version") ?? "");
  const guide = String(fd.get("guide") ?? "");
  const reason = String(fd.get("reason") ?? "").trim().slice(0, 500);
  const back = `/admin/guides/${version}`;
  if (!(await mayEdit()) || !isUuid(version) || !isUuid(guide) || !reason) redirect(`${back}?notice=invalid`);
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("facilitator_guide_withdraw", { p_guide: guide, p_reason: reason });
  if (error) {
    console.error("facilitator_guide_withdraw_failed", error.code ?? "");
    redirect(`${back}?notice=failed`);
  }
  revalidatePath(back);
  redirect(`${back}?notice=withdrawn`);
}
