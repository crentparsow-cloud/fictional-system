"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth";
import { originFrom, startConnectOnboarding } from "@/lib/payouts/connect";
import { PAYOUT_CHANGE_COPY, sendPayoutChangeEmails } from "@/lib/payouts/payout-mail";
import { isUuid } from "@/lib/payouts/status";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Payout actions (F-099, F-143). Server actions, so Next checks the Origin
 * header on every call. The database makes the real decisions: who may act,
 * whether the authenticator code is recent, and how often.
 */

function withParams(path: string, params: Record<string, string>): string {
  const url = new URL(path, "http://x");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.pathname + url.search;
}

/** "Connect payouts": start or continue Stripe onboarding, or open the Express dashboard once verified. */
export async function connectPayouts(formData: FormData): Promise<void> {
  const orgId = String(formData.get("org") ?? "");
  const back = safeNextPath(String(formData.get("back") ?? ""), "/payouts");
  if (!isUuid(orgId)) redirect(withParams(back, { error: "AKY02" }));

  const supabase = await createUserClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect(`/sign-in?next=${encodeURIComponent(back)}`);

  const result = await startConnectOnboarding(orgId, originFrom(await headers()));
  if (result.kind === "redirect") redirect(result.url);
  if (result.kind === "step_up") redirect(`/payouts/verify?next=${encodeURIComponent(back)}`);
  if (result.kind === "held") redirect(withParams(back, { org: orgId, held: "1" }));
  redirect(withParams(back, { org: orgId, error: result.code }));
}

/** Tax residence and the treaty declaration. Needs a recent authenticator code; emails owners and finance. */
export async function saveTaxDetails(formData: FormData): Promise<void> {
  const orgId = String(formData.get("org") ?? "");
  const residence = String(formData.get("tax_residence") ?? "").trim().toUpperCase();
  const treaty = String(formData.get("treaty") ?? "");
  const confirmed = formData.get("confirm") === "yes";
  if (!isUuid(orgId)) redirect("/payouts?error=AKY02");
  if (!/^[A-Z]{2}$/.test(residence) || (treaty !== "yes" && treaty !== "no") || !confirmed) {
    redirect(`/payouts?org=${orgId}&error=tax_invalid#tax-${orgId}`);
  }

  const supabase = await createUserClient();
  const { error } = await supabase.rpc("set_payout_tax_details", { p_org: orgId, p_tax_residence: residence, p_treaty_claimed: treaty === "yes" });
  if (error?.code === "AKY03") redirect(`/payouts/verify?next=${encodeURIComponent(`/payouts?org=${orgId}#tax-${orgId}`)}`);
  if (error) redirect(`/payouts?org=${orgId}&error=${encodeURIComponent(error.code ?? "unknown")}`);

  await sendPayoutChangeEmails(createAdminClient(), {
    orgId,
    what: PAYOUT_CHANGE_COPY.tax,
    dedupeKey: `payout_tax_changed:${orgId}:${Date.now()}`,
    origin: originFrom(await headers()),
  });
  redirect(`/payouts?org=${orgId}&saved=1`);
}
