"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";
import { clearTenantSignInCache } from "@/lib/tenant-resolve";

/**
 * Reader sign-in on a tenant's own host, on or off (F-133). Platform owners
 * only. The write goes through the user client and
 * public.set_tenant_sign_in (migration 0073), which checks the role again,
 * writes the audit row and, when switching off, ends the tenant's scoped
 * sessions. The proxy picks the change up within a minute.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function setTenantSignIn(formData: FormData): Promise<void> {
  const tenantId = formData.get("tenant_id");
  if (typeof tenantId !== "string" || !UUID.test(tenantId)) redirect("/admin/white-label?notice=invalid");
  const back = `/admin/white-label/${tenantId}`;
  const staff = await getStaffSession(back);
  if (!staff.roles.includes("owner")) redirect(`${back}?notice=denied#sign-in`);
  const enabled = formData.get("enabled") === "on";
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason || reason.length > 500) redirect(`${back}?notice=reason#sign-in`);
  // Switching on asks for the thing that must already be true.
  if (enabled && formData.get("hook") !== "yes") redirect(`${back}?notice=tenant_sign_in_checks#sign-in`);

  const supabase = await createUserClient();
  const { error } = await supabase.rpc("set_tenant_sign_in", { p_tenant: tenantId, p_enabled: enabled, p_reason: reason });
  if (error) {
    console.error("admin_tenant_sign_in_failed", error.code ?? "");
    redirect(`${back}?notice=${error.code === "42501" ? "denied" : "failed"}#sign-in`);
  }
  clearTenantSignInCache();
  revalidatePath(back);
  redirect(`${back}?notice=${enabled ? "tenant_sign_in_on" : "tenant_sign_in_off"}#sign-in`);
}
