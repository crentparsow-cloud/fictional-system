"use server";

import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase/server";
import { READER_TERMS_VERSION, termsPageContext } from "@/lib/terms";
import { acceptReaderTerms, readerTermsAccepted } from "@/lib/terms-server";
import { tenantIdForRequest } from "@/lib/tenant-id";

/**
 * Accept the current reader terms (F-122) from the re-ask page. Records the
 * version shown on the page for the signed-in reader only, through
 * public.accept_terms (migration 0018). The context is "reask" when the
 * reader had accepted an earlier version, "signup" when they never had.
 */
export async function acceptTerms(formData: FormData): Promise<void> {
  const next = safeNextPath(String(formData.get("next") ?? ""));
  const back = `/terms?next=${encodeURIComponent(next)}`;
  if (formData.get("terms") !== "yes") redirect(`${back}&error=required`);
  // The page was rendered with an older version: show it again with the current one.
  if (formData.get("terms_version") !== READER_TERMS_VERSION) redirect(`${back}&error=changed`);

  const supabase = await createUserClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect(`/sign-in?next=${encodeURIComponent(back)}`);

  const status = await readerTermsAccepted();
  const context = termsPageContext(status.ok ? status.accepted : null);
  if (!(await acceptReaderTerms(context, await tenantIdForRequest()))) redirect(`${back}&error=save`);
  redirect(next);
}
