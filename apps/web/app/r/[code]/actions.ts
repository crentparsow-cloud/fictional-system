"use server";

import { redirect } from "next/navigation";
import { getReaderSession } from "@/lib/auth";
import { isReferralCode, isReferralUse } from "@/lib/referral";
import { createUserClient } from "@/lib/supabase/server";
import { countEvent } from "@/lib/funnel-server";

/**
 * Use a friend's invitation (6.3). A button press by a signed-in person, a
 * POST, so a page elsewhere cannot attach an invitation for them. The
 * database decides (migration 0051 referral_use): never your own link, never
 * for someone who has paid Akana before, the first invitation wins. Nothing is
 * stored in the browser; the invitation is recorded before any payment.
 */
export async function useInvitation(formData: FormData): Promise<void> {
  const code = String(formData.get("code") ?? "").toUpperCase();
  if (!isReferralCode(code)) redirect("/");
  const session = await getReaderSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(`/r/${code}`)}`);
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("referral_use", { p_code: code });
  const result = error || !isReferralUse(data) ? "unknown_code" : data;
  if (result === "attached") await countEvent("referral_claimed", { userId: session!.userId });
  redirect(`/r/${code}?result=${result}`);
}
