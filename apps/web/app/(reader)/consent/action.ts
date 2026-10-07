"use server";

import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth";
import { HEALTH_CONSENT_VERSION } from "@/lib/consent";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Health data consent (F-026). Records consent for the signed-in reader
 * through public.set_health_consent (migration 0006), which writes their
 * own profile row only, with the wording version shown on the screen.
 */
export async function giveHealthConsent(formData: FormData): Promise<void> {
  const next = safeNextPath(String(formData.get("next") ?? ""));
  const back = `/consent?next=${encodeURIComponent(next)}`;
  if (formData.get("consent") !== "yes") redirect(`${back}&error=required`);

  const supabase = await createUserClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect(`/sign-in?next=${encodeURIComponent(back)}`);

  const { error } = await supabase.rpc("set_health_consent", { p_version: HEALTH_CONSENT_VERSION });
  if (error) {
    console.error("health_consent_failed", error.code);
    redirect(`${back}&error=save`);
  }
  redirect(next);
}
