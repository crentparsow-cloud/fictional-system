"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { whiteLabelAbilities } from "@/lib/admin/white-label";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";
import { clearTenantCache } from "@/lib/tenant-resolve";
import { checkDomainTxt, domainErrorNotice, parseDomainInput } from "@/lib/tenant-domains";

/**
 * Custom domains for a white-label tenant (migration 0033). Every write goes
 * through the user client and a security definer function that checks the
 * platform role and writes the audit row: add_tenant_domain,
 * remove_tenant_domain and record_tenant_domain_check. The Verify button
 * does the DNS lookup here (Cloudflare DNS-over-HTTPS, lib/tenant-domains.ts)
 * and hands the result to the database. Nothing here calls Vercel.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function tenantIdFrom(formData: FormData): string {
  const id = formData.get("tenant_id");
  if (typeof id !== "string" || !UUID.test(id)) redirect("/admin/white-label?notice=invalid");
  return id;
}

async function editor(tenantId: string) {
  const staff = await getStaffSession(`/admin/white-label/${tenantId}`);
  if (!whiteLabelAbilities(staff.roles).editTenants) redirect(`/admin/white-label/${tenantId}?notice=denied#domains`);
}

/** The host from a hidden field, normalised, and only if this tenant owns it. */
async function ownedHost(formData: FormData, tenantId: string, back: string) {
  const parsed = parseDomainInput(formData.get("host"), []);
  if (!parsed.ok) redirect(`${back}?notice=invalid#domains`);
  const supabase = await createUserClient();
  const { data } = await supabase
    .from("tenant_domains")
    .select("host, verification_token")
    .eq("host", parsed.host)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const row = data as { host: string; verification_token: string } | null;
  if (!row) redirect(`${back}?notice=domain_unknown#domains`);
  return { supabase, row };
}

export async function addTenantDomain(formData: FormData): Promise<void> {
  const tenantId = tenantIdFrom(formData);
  await editor(tenantId);
  const back = `/admin/white-label/${tenantId}`;
  const parsed = parseDomainInput(formData.get("host"));
  if (!parsed.ok) redirect(`${back}?notice=${parsed.reason === "reserved" ? "domain_reserved" : "domain_invalid"}#domains`);

  const supabase = await createUserClient();
  const { error } = await supabase.rpc("add_tenant_domain", { p_tenant: tenantId, p_host: parsed.host });
  if (error) {
    console.error("admin_tenant_domain_add_failed", error.code ?? "");
    redirect(`${back}?notice=${domainErrorNotice(error.code)}#domains`);
  }
  revalidatePath(back);
  redirect(`${back}?notice=domain_added#domains`);
}

export async function verifyTenantDomain(formData: FormData): Promise<void> {
  const tenantId = tenantIdFrom(formData);
  await editor(tenantId);
  const back = `/admin/white-label/${tenantId}`;
  const { supabase, row } = await ownedHost(formData, tenantId, back);

  const result = await checkDomainTxt(row.host, row.verification_token);
  const { data, error } = await supabase.rpc("record_tenant_domain_check", { p_host: row.host, p_result: result });
  if (error) {
    console.error("admin_tenant_domain_check_failed", error.code ?? "");
    redirect(`${back}?notice=${domainErrorNotice(error.code)}#domains`);
  }
  // This instance forgets its cached answer for the host at once; other instances within a minute.
  clearTenantCache();
  revalidatePath(back);
  const verified = Boolean((data as { verified?: boolean } | null)?.verified);
  const notice =
    result === "ok" ? "domain_verified" : result === "dns_error" ? "domain_dns_error" : verified ? "domain_check_failed" : "domain_not_yet";
  redirect(`${back}?notice=${notice}#domains`);
}

export async function removeTenantDomain(formData: FormData): Promise<void> {
  const tenantId = tenantIdFrom(formData);
  await editor(tenantId);
  const back = `/admin/white-label/${tenantId}`;
  const reason = formData.get("reason");
  if (typeof reason !== "string" || !reason.trim() || reason.length > 500) redirect(`${back}?notice=reason#domains`);
  const { supabase, row } = await ownedHost(formData, tenantId, back);

  const { error } = await supabase.rpc("remove_tenant_domain", { p_host: row.host, p_reason: reason.trim() });
  if (error) {
    console.error("admin_tenant_domain_remove_failed", error.code ?? "");
    redirect(`${back}?notice=${domainErrorNotice(error.code)}#domains`);
  }
  clearTenantCache();
  revalidatePath(back);
  redirect(`${back}?notice=domain_removed#domains`);
}
