"use server";

import { redirect } from "next/navigation";
import { getReaderSession } from "@/lib/auth";
import { cleanLabel, isAcceptOutcome } from "@/lib/friends/pair";
import { hashInviteToken, isInviteToken } from "@/lib/shared-membership-token";
import { createUserClient } from "@/lib/supabase/server";

/** Accept an invitation. The outcome word comes from the database and the page turns it into plain wording. */
export async function acceptPairInvite(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  if (!isInviteToken(token)) redirect("/");
  const session = await getReaderSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(`/friend/${token}`)}`);
  const rawLabel = String(formData.get("label") ?? "").trim();
  const label = rawLabel === "" ? "Your friend" : cleanLabel(rawLabel);
  if (!label) redirect(`/friend/${token}?outcome=bad_label`);
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("accept_pair_invite", { p_hash: hashInviteToken(token), p_label: label });
  if (error || !isAcceptOutcome(data)) {
    console.error("pair_accept_failed", error?.code ?? "");
    redirect(`/friend/${token}?outcome=invalid`);
  }
  if (data === "joined") redirect("/you/friends?notice=joined");
  redirect(`/friend/${token}?outcome=${data}`);
}
