"use server";

import { redirect } from "next/navigation";
import { getReaderSession } from "@/lib/auth";
import { isGiftClaimResult, isGiftToken } from "@/lib/send-workbook";
import { hashInviteToken } from "@/lib/shared-membership-token";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Claim a gifted workbook (14.14). A POST by the signed-in person who holds
 * the link. The service role makes the claim for them because it also writes
 * the author's payment to the ledger, and the server, not the browser, says
 * whether the money is live. No card is involved.
 */
export async function claimGift(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  if (!isGiftToken(token)) redirect("/");
  const session = await getReaderSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(`/send/${token}`)}`);
  const livemode = (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live");
  const { data, error } = await createAdminClient().rpc("gift_claim", { p_user: session.userId, p_token_hash: hashInviteToken(token), p_livemode: livemode });
  if (error) {
    console.error("gift_claim_failed", error.code ?? "");
    redirect(`/send/${token}?result=unknown`);
  }
  const result = isGiftClaimResult(data) ? data : "unknown";
  if (result === "claimed" || result === "unchanged") {
    const { data: wb } = await createAdminClient()
      .from("workbook_gifts")
      .select("workbooks(slug)")
      .eq("token_hash", hashInviteToken(token))
      .maybeSingle();
    const slug = (wb as { workbooks?: { slug?: string } | null } | null)?.workbooks?.slug;
    redirect(slug ? `/read/${slug}?gift=1` : "/library");
  }
  redirect(`/send/${token}?result=${result}`);
}
