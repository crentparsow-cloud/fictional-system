"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { billingErrorNotice } from "@/lib/org-billing";
import { requireRoleMfa } from "@/lib/mfa/role-mfa-server";
import { requireOrgConsole, withOrgParam } from "@/lib/org-pilot-server";
import { createUserClient } from "@/lib/supabase/server";

/** The owner switches the monthly report email on or off (0061). It changes who is mailed, so it asks for the second factor first. */
export async function setMonthlyReport(formData: FormData): Promise<void> {
  const ctx = await requireOrgConsole("/org/reports", String(formData.get("org") ?? ""));
  const back = withOrgParam("/org/reports", ctx.org.id, ctx.multi);
  const sep = back.includes("?") ? "&" : "?";
  if (ctx.org.role !== "owner") redirect(`${back}${sep}notice=denied`);
  await requireRoleMfa(ctx.org.role, back);
  const on = formData.get("on") === "yes";
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("org_report_pref_set", { p_org: ctx.org.id, p_on: on });
  if (error) {
    console.error("org_report_pref_failed", error.code ?? "");
    redirect(`${back}${sep}notice=${billingErrorNotice(error.code)}`);
  }
  revalidatePath("/org/reports");
  redirect(`${back}${sep}notice=${on ? "report_on" : "report_off"}`);
}
