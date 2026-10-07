"use server";

import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase/server";
import { READER_TERMS_VERSION } from "@/lib/terms";
import { acceptReaderTerms } from "@/lib/terms-server";
import { tenantIdForRequest } from "@/lib/tenant-id";

/**
 * Adults-only confirmation (F-127) and sign-up acceptance of the reader
 * terms (F-122). Sets adult_confirmed_at on the reader's own profile row
 * (RLS allows their row and no other) and records the terms version shown
 * on the page through public.accept_terms. Both boxes are required. If the
 * page was rendered with an older terms version, the reader sees the page
 * again with the current one.
 */
export async function confirmAdult(formData: FormData): Promise<void> {
  const next = safeNextPath(String(formData.get("next") ?? ""));
  if (formData.get("adult") !== "yes" || formData.get("terms") !== "yes") redirect(`/welcome?error=required&next=${encodeURIComponent(next)}`);
  if (formData.get("terms_version") !== READER_TERMS_VERSION) redirect(`/welcome?error=required&next=${encodeURIComponent(next)}`);

  const supabase = await createUserClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect(`/sign-in?next=${encodeURIComponent(next)}`);

  const tenantId = await tenantIdForRequest();
  if (!(await acceptReaderTerms("signup", tenantId))) redirect(`/welcome?error=save&next=${encodeURIComponent(next)}`);

  const { error } = await supabase.from("profiles").update({ adult_confirmed_at: new Date().toISOString() }).eq("user_id", data.user.id);
  if (error) {
    console.error("adult_confirm_failed", error.code);
    redirect(`/welcome?error=save&next=${encodeURIComponent(next)}`);
  }
  redirect(next);
}
