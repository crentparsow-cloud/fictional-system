"use server";

import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth";
import { FAITH_CONSENT_VERSION } from "@/lib/consent";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Faith consent (F-150). Records consent for the signed-in reader through
 * public.set_faith_consent (migration 0015), which writes their own profile
 * row only, with the wording version shown on the screen.
 */
export async function giveFaithConsent(formData: FormData): Promise<void> {
  const next = safeNextPath(String(formData.get("next") ?? ""));
  const back = `/consent/faith?next=${encodeURIComponent(next)}`;
  if (formData.get("consent") !== "yes") redirect(`${back}&error=required`);

  const supabase = await createUserClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect(`/sign-in?next=${encodeURIComponent(back)}`);

  const { error } = await supabase.rpc("set_faith_consent", { p_version: FAITH_CONSENT_VERSION });
  if (error) {
    console.error("faith_consent_failed", error.code);
    redirect(`${back}&error=save`);
  }
  redirect(next);
}
