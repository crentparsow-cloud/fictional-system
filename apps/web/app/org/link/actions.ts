"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { linkClaimErrorCode } from "@/lib/org-billing";
import { hashToken, isTokenShaped } from "@/lib/partner";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Take a seat with a join link (F-225). 0030's org_join_link_claim checks
 * the link, the cap, the domain, the 18 or over tick and the hourly limit.
 */
export async function claimWithLink(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  if (!isTokenShaped(token)) redirect("/");
  const path = `/org/link/${token}`;
  const supabase = await createUserClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) redirect(`/sign-in?next=${encodeURIComponent(path)}`);
  const { error } = await supabase.rpc("org_join_link_claim", { p_token_hash: await hashToken(token), p_adult: formData.get("adult") === "yes" });
  if (error) {
    console.error("org_join_link_claim_failed", error.code ?? "");
    redirect(`${path}?e=${linkClaimErrorCode(error.code)}`);
  }
  revalidatePath("/library");
  redirect(`${path}?done=claimed`);
}
