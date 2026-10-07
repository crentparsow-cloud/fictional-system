"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminAbilities } from "@/lib/admin/permissions";
import { isKillSwitchAction, killSwitchTarget, parsePauseReason, parseWorkbookCode } from "@/lib/admin/workbooks";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Kill switch (F-083): pause a live workbook or resume a paused one.
 *
 * Runs through the user client. workbooks_update (0002) admits platform
 * owners and editors, and guard_workbook_status lets only them set live, so
 * the database refuses anyone else even if this check were skipped.
 *
 * The update is conditional on the status the confirm screen showed, so two
 * staff acting at once cannot flip it back and forth by accident.
 *
 * Audit: app.audit() lives in the app schema, which PostgREST does not expose,
 * and there is no public wrapper, so this action cannot write an audit row.
 * Neither the status guard nor any trigger audits workbook status changes.
 * Until a migration adds one, the change and its reason go to the server log.
 */
export async function setWorkbookLive(formData: FormData): Promise<void> {
  const staff = await getStaffSession("/admin/workbooks");
  const code = parseWorkbookCode(formData.get("code"));
  const action = formData.get("action");
  if (!code || !isKillSwitchAction(action)) redirect("/admin/workbooks?notice=invalid");
  if (!adminAbilities(staff.roles).pauseWorkbooks) redirect("/admin/workbooks?notice=denied");

  const reason = parsePauseReason(action, formData.get("reason"));
  if (!reason.ok) redirect(`/admin/workbooks?confirm=${code}&notice=reason`);

  const supabase = await createUserClient();
  const { data: row, error: readError } = await supabase.from("workbooks").select("id, status").eq("code", code).maybeSingle();
  if (readError) console.error("admin_workbook_read_failed", readError.code ?? "");
  if (!row) redirect("/admin/workbooks?notice=invalid");

  const current = String((row as { status: unknown }).status);
  const target = killSwitchTarget(action, current);
  if (!target) redirect("/admin/workbooks?notice=stale");

  const { data, error } = await supabase
    .from("workbooks")
    .update({ status: target })
    .eq("id", (row as { id: string }).id)
    .eq("status", current)
    .select("id");
  if (error) {
    console.error("admin_workbook_status_failed", error.code ?? "");
    redirect(`/admin/workbooks?notice=${error.code === "42501" ? "denied" : "failed"}`);
  }
  if (!data || data.length === 0) redirect("/admin/workbooks?notice=stale");

  console.info("admin_workbook_kill_switch", JSON.stringify({ code, from: current, to: target, actor: staff.userId, reason: reason.reason }));

  revalidatePath("/admin/workbooks");
  revalidatePath("/admin");
  redirect(`/admin/workbooks?notice=${target === "paused" ? "paused" : "resumed"}`);
}
