"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isCohortFlag, parsePercent } from "@/lib/platform/flags";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Change a cohort flag (10.5). Owners only; the database function checks that
 * again, allows cohort flags only and writes the audit row.
 */
export async function saveFlag(fd: FormData): Promise<void> {
  const staff = await getStaffSession("/admin/flags");
  if (!staff.roles.includes("owner")) redirect("/admin/flags?notice=denied");
  const key = fd.get("key");
  const percent = parsePercent(fd.get("percent"));
  if (!isCohortFlag(key) || percent === null) redirect("/admin/flags?notice=invalid");
  const enabled = fd.get("enabled") === "on";
  const reason = typeof fd.get("reason") === "string" ? String(fd.get("reason")).trim().slice(0, 200) : "";
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("set_flag", { p_key: key, p_enabled: enabled, p_percent: percent, p_reason: reason });
  if (error) {
    console.error("admin_flag_failed", error.code ?? "");
    redirect(`/admin/flags?notice=${error.code === "42501" ? "denied" : "failed"}`);
  }
  revalidatePath("/admin/flags");
  redirect("/admin/flags?notice=saved");
}
