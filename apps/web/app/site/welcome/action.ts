"use server";

import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth";
import { getTenantReader, loadTenantGates, nextTenantGate, tenantWriteErrorCode } from "@/lib/tenant-reader";
import { READER_TERMS_VERSION } from "@/lib/terms";

/**
 * The gates before reading on a tenant site (F-133): 18 or over (F-127) and
 * the reader terms (F-122). The same facts as on the Akana site, recorded on
 * the one shared account through the tenant reader functions (migration
 * 0073), which act on the caller's own row and record the tenant from the
 * token. A reader who has already passed a gate on any Akana site is not
 * asked again, and nothing already on the account is changed: the functions
 * only fill what is missing, and take the current terms version only.
 */
export async function passTenantGate(formData: FormData): Promise<void> {
  const next = safeNextPath(String(formData.get("next") ?? ""), "/my-workbooks");
  const back = `/welcome?next=${encodeURIComponent(next)}`;
  const reader = await getTenantReader();
  if (!reader) redirect(`/sign-in?next=${encodeURIComponent(back)}`);
  const gates = await loadTenantGates(reader.supabase);
  if (!gates) redirect(`${back}&error=save`);
  const gate = nextTenantGate(gates);
  if (!gate) redirect(next);

  // The page was drawn with an older terms version: show it again with the current one.
  if (formData.get("terms_version") !== READER_TERMS_VERSION) redirect(`${back}&error=changed`);
  if (formData.get("terms") !== "yes") redirect(`${back}&error=required`);
  if (gate === "welcome" && formData.get("adult") !== "yes") redirect(`${back}&error=required`);

  const { error } =
    gate === "welcome"
      ? await reader.supabase.rpc("tenant_reader_confirm_adult", { p_terms_version: READER_TERMS_VERSION })
      : await reader.supabase.rpc("tenant_reader_accept_terms", { p_version: READER_TERMS_VERSION });
  if (error) {
    console.error("tenant_gate_failed", error.code ?? "");
    redirect(`${back}&error=${tenantWriteErrorCode(error.code)}`);
  }
  redirect(next);
}
