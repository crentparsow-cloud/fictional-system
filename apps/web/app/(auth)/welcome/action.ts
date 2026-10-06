"use server";

import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Adults-only confirmation (F-127). Sets adult_confirmed_at on the reader's
 * own profile row. RLS allows the update on their row and no other.
 */
export async function confirmAdult(formData: FormData): Promise<void> {
  const next = safeNextPath(String(formData.get("next") ?? ""));
  if (formData.get("adult") !== "yes") redirect(`/welcome?error=required&next=${encodeURIComponent(next)}`);

  const supabase = await createUserClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect(`/sign-in?next=${encodeURIComponent(next)}`);

  const { error } = await supabase.from("profiles").update({ adult_confirmed_at: new Date().toISOString() }).eq("user_id", data.user.id);
  if (error) {
    console.error("adult_confirm_failed", error.code);
    redirect(`/welcome?error=save&next=${encodeURIComponent(next)}`);
  }
  redirect(next);
}
