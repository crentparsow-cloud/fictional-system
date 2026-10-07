"use server";

import { redirect } from "next/navigation";
import { isDeleteConfirmed, type YouNotice } from "@/lib/account";
import { createUserClient } from "@/lib/supabase/server";

/**
 * You tab actions (F-025). Each runs as the signed-in reader through the
 * user client, so the security definer functions in 0006 and 0007 see
 * app.uid() and act on that reader only. They return to /you with a notice.
 */

const back = (notice: YouNotice): never => redirect(`/you?notice=${notice}#your-data`);

export async function requestDeletion(formData: FormData): Promise<void> {
  if (!isDeleteConfirmed(formData.get("confirm"))) back("deletion-confirm");
  const supabase = await createUserClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/sign-in?next=/you");
  const { error } = await supabase.rpc("request_account_deletion");
  if (error) back("deletion-failed");
  back("deletion-requested");
}

export async function cancelDeletion(): Promise<void> {
  const supabase = await createUserClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/sign-in?next=/you");
  const { error } = await supabase.rpc("cancel_account_deletion");
  if (error) back("cancel-failed");
  back("deletion-cancelled");
}

/** Calls app.clear_health_consent() through its public wrapper (0006). */
export async function withdrawHealthConsent(): Promise<void> {
  const supabase = await createUserClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/sign-in?next=/you");
  const { error } = await supabase.rpc("clear_health_consent");
  if (error) back("consent-failed");
  back("consent-withdrawn");
}

/** Calls app.clear_faith_consent() through its public wrapper (0015, F-150). */
export async function withdrawFaithConsent(): Promise<void> {
  const supabase = await createUserClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/sign-in?next=/you");
  const { error } = await supabase.rpc("clear_faith_consent");
  if (error) back("faith-consent-failed");
  back("faith-consent-withdrawn");
}
