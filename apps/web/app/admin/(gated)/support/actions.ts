"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUuid } from "@/lib/admin/leads";
import { adminAbilities } from "@/lib/admin/permissions";
import { isSupportStatus } from "@/lib/admin/support";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";

/** Change a support message's status (F-090). RLS allows the status column only; a trigger writes the audit row. */
export async function setSupportStatus(fd: FormData): Promise<void> {
  const staff = await getStaffSession("/admin/support");
  const id = fd.get("id");
  const status = fd.get("status");
  if (!isUuid(id) || !isSupportStatus(status)) redirect("/admin/support?notice=invalid");
  if (!adminAbilities(staff.roles).updateSupport) redirect(`/admin/support/${id}?notice=denied`);
  const supabase = await createUserClient();
  const { data, error } = await supabase.from("support_messages").update({ status }).eq("id", id).select("id");
  if (error || !data?.length) {
    console.error("admin_support_status_failed", error?.code ?? "no_row");
    redirect(`/admin/support/${id}?notice=failed`);
  }
  revalidatePath("/admin/support");
  revalidatePath("/admin");
  redirect(`/admin/support/${id}?notice=status`);
}
