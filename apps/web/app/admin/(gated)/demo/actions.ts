"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseDemoLook, whiteLabelAbilities, whiteLabelErrorNotice } from "@/lib/admin/white-label";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";

/**
 * The demo publisher (F-074) and its logins (F-045), through the 0023
 * functions on the user client. reset_demo_state admits platform owners and
 * editors; add_demo_account and remove_demo_account admit owners only. No
 * account or password is created here: Crent creates the sign-ins, then
 * registers them below (docs/WHITE_LABEL_DEMO.md).
 */

const BACK = "/admin/demo";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EMAIL = /^[^\s@<>]{1,64}@[^\s@<>]{1,190}$/;

export async function resetDemo(formData: FormData): Promise<void> {
  const staff = await getStaffSession(BACK);
  if (!whiteLabelAbilities(staff.roles).resetDemo) redirect(`${BACK}?notice=denied`);
  const look = formData.get("look") ? parseDemoLook(formData.get("look")) : null;
  if (formData.get("look") && !look) redirect(`${BACK}?notice=invalid`);
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("reset_demo_state", { p_look: look });
  if (error) {
    console.error("admin_demo_reset_failed", error.code ?? "");
    redirect(`${BACK}?notice=${whiteLabelErrorNotice(error.code)}`);
  }
  revalidatePath(BACK);
  revalidatePath("/admin/white-label");
  redirect(`${BACK}?notice=demo_reset`);
}

export async function addDemoLogin(formData: FormData): Promise<void> {
  const staff = await getStaffSession(BACK);
  if (!whiteLabelAbilities(staff.roles).manageDemoLogins) redirect(`${BACK}?notice=denied`);
  const email = String(formData.get("email") ?? "").trim();
  const kind = formData.get("kind");
  if (!EMAIL.test(email) || (kind !== "author" && kind !== "publisher")) redirect(`${BACK}?notice=invalid`);
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("add_demo_account", { p_email: email, p_kind: kind });
  if (error) {
    console.error("admin_demo_login_add_failed", error.code ?? "");
    redirect(`${BACK}?notice=${whiteLabelErrorNotice(error.code)}`);
  }
  revalidatePath(BACK);
  redirect(`${BACK}?notice=demo_login_added`);
}

export async function removeDemoLogin(formData: FormData): Promise<void> {
  const staff = await getStaffSession(BACK);
  if (!whiteLabelAbilities(staff.roles).manageDemoLogins) redirect(`${BACK}?notice=denied`);
  const userId = formData.get("user_id");
  if (typeof userId !== "string" || !UUID.test(userId)) redirect(`${BACK}?notice=invalid`);
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("remove_demo_account", { p_user: userId });
  if (error) {
    console.error("admin_demo_login_remove_failed", error.code ?? "");
    redirect(`${BACK}?notice=${whiteLabelErrorNotice(error.code)}`);
  }
  revalidatePath(BACK);
  redirect(`${BACK}?notice=demo_login_removed`);
}
