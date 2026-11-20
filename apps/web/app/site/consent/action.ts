"use server";

import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth";
import { HEALTH_CONSENT_VERSION } from "@/lib/consent";
import { getTenantReader, tenantWriteErrorCode } from "@/lib/tenant-reader";

/**
 * Explicit consent to store health data (F-026), given on a tenant site
 * (F-133). Recorded on the reader's Akana account through
 * public.tenant_reader_set_health_consent (migration 0073) with the version
 * of the wording shown. Only "yes" from the checkbox counts.
 *
 * The database refuses when the reader has ever withdrawn this consent, or
 * while the account is read only. Either way the reader is sent to the
 * Akana site, where the account is managed.
 */
export async function giveTenantHealthConsent(formData: FormData): Promise<void> {
  const next = safeNextPath(String(formData.get("next") ?? ""), "/my-workbooks");
  const back = `/consent?next=${encodeURIComponent(next)}`;
  if (formData.get("consent") !== "yes") redirect(`${back}&error=required`);
  const reader = await getTenantReader();
  if (!reader) redirect(`/sign-in?next=${encodeURIComponent(back)}`);
  const { error } = await reader.supabase.rpc("tenant_reader_set_health_consent", { p_version: HEALTH_CONSENT_VERSION });
  if (error) {
    console.error("tenant_health_consent_failed", error.code ?? "");
    redirect(`${back}&error=${tenantWriteErrorCode(error.code)}`);
  }
  redirect(next);
}
