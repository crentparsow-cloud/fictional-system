"use server";

import { redirect } from "next/navigation";
import { getReaderSession } from "@/lib/auth";
import { isClaimToken } from "@/lib/gift";
import { createUserClient } from "@/lib/supabase/server";

/**
 * The button on the gift page. Opening the link changes nothing; this does.
 * The database checks the token, the expiry and that it is unused.
 */
export async function claimGiftAction(formData: FormData): Promise<void> {
  const token = String(formData.get("t") ?? "");
  if (!isClaimToken(token)) redirect("/gift/invalid?r=invalid");
  const session = await getReaderSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(`/gift/${token}`)}`);
  let result = "invalid";
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase.rpc("claim_gift", { p_token: token });
    if (!error && typeof data === "string") result = data;
  } catch (err) {
    console.error("claim_gift_failed", err instanceof Error ? err.name : "unknown");
  }
  if (result === "claimed") redirect("/you?gift=claimed");
  redirect(`/gift/${token}?r=${encodeURIComponent(result)}`);
}
