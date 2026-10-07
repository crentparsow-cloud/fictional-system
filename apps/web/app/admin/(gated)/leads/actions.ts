"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseLeadStatusChange } from "@/lib/admin/leads";
import { adminAbilities } from "@/lib/admin/permissions";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Change a lead's status (F-001). Status only: migration 0005 grants update
 * on the status column alone, and leads_staff_update admits owner, editor and
 * support. The leads_status_audit trigger writes the audit row.
 */
export async function setLeadStatus(formData: FormData): Promise<void> {
  const staff = await getStaffSession("/admin/leads");
  const change = parseLeadStatusChange((k) => formData.get(k));
  if (!change) redirect("/admin/leads?notice=invalid");
  const back = `/admin/leads/${change.id}`;
  if (!adminAbilities(staff.roles).updateLeads) redirect(`${back}?notice=denied`);

  const supabase = await createUserClient();
  const { data, error } = await supabase.from("leads").update({ status: change.status }).eq("id", change.id).select("id");
  if (error) {
    console.error("admin_lead_status_failed", error.code ?? "");
    redirect(`${back}?notice=failed`);
  }
  if (!data || data.length === 0) redirect(`${back}?notice=denied`);

  revalidatePath("/admin/leads");
  revalidatePath("/admin");
  redirect(`${back}?notice=status`);
}
