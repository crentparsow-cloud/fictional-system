"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUuid } from "@/lib/admin/leads";
import { adminAbilities } from "@/lib/admin/permissions";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";

/** Acknowledge an alert (F-142) through public.acknowledge_ops_alert, which writes the audit row. */
export async function acknowledgeAlert(fd: FormData): Promise<void> {
  const staff = await getStaffSession("/admin/ops");
  const id = fd.get("alert");
  if (!isUuid(id)) redirect("/admin/ops?notice=invalid");
  if (!adminAbilities(staff.roles).acknowledgeOps) redirect("/admin/ops?notice=denied");
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("acknowledge_ops_alert", { p_alert: id });
  if (error) {
    console.error("admin_ops_ack_failed", error.code ?? "");
    redirect(`/admin/ops?notice=${error.code === "55000" ? "stale" : error.code === "42501" ? "denied" : "failed"}`);
  }
  revalidatePath("/admin/ops");
  revalidatePath("/admin");
  redirect("/admin/ops?notice=acknowledged");
}
