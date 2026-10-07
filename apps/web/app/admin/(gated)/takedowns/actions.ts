"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dashAbilities } from "@/lib/account-lookup";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";
import { REASON_MAX, STATEMENT_MAX, cleanText, isUuid, takedownErrorNotice } from "@/lib/takedown";

/**
 * Takedown queue actions (F-123). Every change goes through the user client
 * and the 0022 functions, which check the role, lock the rows and write the
 * audit row. Owners and editors decide; support may mark a notice as being
 * reviewed or withdrawn.
 */

const AK = /^AK-[0-9A-HJKMNP-TV-Z]{5}$/;

function back(id: string, notice: string): never {
  revalidatePath("/admin/takedowns");
  redirect(`/admin/takedowns/${id}?notice=${notice}`);
}

export async function markNotice(fd: FormData): Promise<void> {
  const staff = await getStaffSession("/admin/takedowns");
  const id = fd.get("id");
  const status = fd.get("status");
  if (!isUuid(id) || (status !== "reviewing" && status !== "withdrawn")) redirect("/admin/takedowns?notice=invalid");
  if (!dashAbilities(staff.roles).readTakedowns) back(id, "denied");
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("takedown_mark", { p_notice: id, p_status: status, p_reason: cleanText(fd.get("reason"), REASON_MAX) || null });
  if (error) {
    console.error("admin_takedown_mark_failed", error.code ?? "");
    back(id, takedownErrorNotice(error.code));
  }
  back(id, status);
}

export async function decideNotice(fd: FormData): Promise<void> {
  const staff = await getStaffSession("/admin/takedowns");
  const id = fd.get("id");
  const decision = fd.get("decision");
  if (!isUuid(id) || (decision !== "action" && decision !== "reject")) redirect("/admin/takedowns?notice=invalid");
  if (!dashAbilities(staff.roles).decideTakedowns) back(id, "denied");
  const reason = cleanText(fd.get("reason"), REASON_MAX);
  const statement = cleanText(fd.get("statement"), STATEMENT_MAX);
  if (!reason || (decision === "action" && statement.length < 20)) back(id, "td_invalid");

  const supabase = await createUserClient();
  let workbookId: string | null = null;
  const code = cleanText(fd.get("workbook_code"), 20).toUpperCase();
  if (decision === "action" && code) {
    if (!AK.test(code)) back(id, "td_workbook");
    const { data } = await supabase.from("workbooks").select("id").eq("code", code).maybeSingle();
    if (!data) back(id, "td_workbook");
    workbookId = (data as { id: string }).id;
  }
  const { error } = await supabase.rpc("takedown_decide", {
    p_notice: id,
    p_decision: decision,
    p_reason: reason,
    p_statement: decision === "action" ? statement : null,
    p_workbook: workbookId,
  });
  if (error) {
    console.error("admin_takedown_decide_failed", error.code ?? "");
    back(id, takedownErrorNotice(error.code));
  }
  revalidatePath("/admin/workbooks");
  back(id, decision === "action" ? "actioned" : "rejected");
}

export async function reinstateTitle(fd: FormData): Promise<void> {
  const staff = await getStaffSession("/admin/takedowns");
  const id = fd.get("id");
  const takedown = fd.get("takedown");
  const counter = fd.get("counter");
  if (!isUuid(id) || !isUuid(takedown)) redirect("/admin/takedowns?notice=invalid");
  if (!dashAbilities(staff.roles).decideTakedowns) back(id, "denied");
  const reason = cleanText(fd.get("reason"), REASON_MAX);
  if (!reason) back(id, "td_invalid");
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("takedown_reinstate", { p_takedown: takedown, p_reason: reason, p_counter: isUuid(counter) ? counter : null });
  if (error) {
    console.error("admin_takedown_reinstate_failed", error.code ?? "");
    back(id, takedownErrorNotice(error.code));
  }
  revalidatePath("/admin/workbooks");
  back(id, "reinstated");
}
