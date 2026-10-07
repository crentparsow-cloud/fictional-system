"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminAbilities } from "@/lib/admin/permissions";
import { isKillSwitchAction, killSwitchErrorNotice, killSwitchTarget, parsePauseReason, parseWorkbookCode } from "@/lib/admin/workbooks";
import { sendAuthorStatus } from "@/lib/author-mail";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Kill switch (F-083): pause a live workbook or resume a paused one.
 *
 * Runs through the user client and public.set_workbook_paused (migration
 * 0008). The function admits platform owners and editors only, moves the
 * status between live and paused and nothing else, and writes the audit row
 * with the reason in the same transaction. A reason is required both ways.
 *
 * The status read here only checks that the confirm screen still matches.
 * The function locks the row and refuses a pause of anything not live, or a
 * resume of anything not paused, so two staff acting at once cannot flip it
 * back and forth by accident.
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

  const { error } = await supabase.rpc("set_workbook_paused", {
    p_workbook: (row as { id: string }).id,
    p_paused: action === "pause",
    p_reason: reason.reason,
  });
  if (error) {
    console.error("admin_workbook_status_failed", error.code ?? "");
    const notice = killSwitchErrorNotice(error.code);
    redirect(notice === "reason" ? `/admin/workbooks?confirm=${code}&notice=reason` : `/admin/workbooks?notice=${notice}`);
  }

  // F-043: the organisation hears that its workbook is paused. The staff
  // reason stays in the audit log; the email points them to support.
  if (target === "paused") await sendAuthorStatus((row as { id: string }).id, "paused");

  revalidatePath("/admin/workbooks");
  revalidatePath("/admin");
  redirect(`/admin/workbooks?notice=${target === "paused" ? "paused" : "resumed"}`);
}
