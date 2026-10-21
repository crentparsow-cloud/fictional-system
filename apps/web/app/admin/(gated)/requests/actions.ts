"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUuid } from "@/lib/admin/leads";
import { adminAbilities } from "@/lib/admin/permissions";
import { isRequestStatus } from "@/lib/admin/title-requests";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";

const MAX_IDS = 200;

/**
 * Set the status and staff note on every request in a group (build list 2.8).
 * public.set_title_request_status checks the role again and writes the audit
 * row for each one.
 */
export async function setRequestGroupStatus(fd: FormData): Promise<void> {
  const staff = await getStaffSession("/admin/requests");
  const status = fd.get("status");
  const note = fd.get("note");
  const ids = fd.getAll("id").filter(isUuid).slice(0, MAX_IDS);
  if (!isRequestStatus(status) || ids.length === 0) redirect("/admin/requests?notice=invalid");
  if (!adminAbilities(staff.roles).updateSupport) redirect("/admin/requests?notice=denied");
  const text = typeof note === "string" ? note : "";
  if (text.trim().length > 500) redirect("/admin/requests?notice=reason");

  const supabase = await createUserClient();
  let failed = 0;
  for (const id of ids) {
    const { error } = await supabase.rpc("set_title_request_status", { p_id: id, p_status: status, p_note: text });
    if (error) {
      failed += 1;
      console.error("admin_title_request_failed", error.code ?? "");
    }
  }
  revalidatePath("/admin/requests");
  redirect(`/admin/requests?notice=${failed ? "failed" : "status"}`);
}
