"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getReaderSession } from "@/lib/auth";
import { cleanLabel, isNudgeCode } from "@/lib/friends/pair";
import { announceFinishForPair } from "@/lib/friends/nudge-server";
import { originFrom } from "@/lib/partner";
import { hashInviteToken, newInviteToken } from "@/lib/shared-membership-token";
import { createUserClient } from "@/lib/supabase/server";
import { inviteUrl } from "@/lib/friends/pair";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BACK = "/you/friends";

export interface InviteState {
  error: string | null;
  link?: string;
}

/** Make an invitation for one of the reader's programmes. The link is shown once; only its hash is kept. */
export async function createInvite(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const session = await getReaderSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(BACK)}`);
  const enrolment = String(formData.get("enrolment") ?? "");
  const rawLabel = String(formData.get("label") ?? "").trim();
  const label = rawLabel === "" ? "Your friend" : cleanLabel(rawLabel);
  if (!UUID.test(enrolment)) return { error: "Pick a workbook." };
  if (!label) return { error: "Use a short, plain name of up to 30 characters." };
  const token = newInviteToken();
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("create_pair_invite", { p_enrolment: enrolment, p_hash: hashInviteToken(token), p_label: label });
  if (error) {
    console.error("pair_invite_failed", error.code ?? "");
    switch (error.code) {
      case "0A000":
        return { error: "Doing a programme with a friend is not open to your account yet." };
      case "55000":
        return { error: "This workbook is read on your own." };
      case "23505":
        return { error: "You already have a pairing on this workbook." };
      case "54000":
        return { error: "You have five open pairings. End one first." };
      default:
        return { error: "The invitation could not be made just now. Try again in a moment." };
    }
  }
  return { error: null, link: inviteUrl(originFrom(await headers()), token) };
}

export async function endPairing(formData: FormData): Promise<void> {
  const session = await getReaderSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(BACK)}`);
  const pair = String(formData.get("pair") ?? "");
  if (UUID.test(pair)) {
    const supabase = await createUserClient();
    const { error } = await supabase.rpc("end_pair", { p_pair: pair });
    if (error) console.error("pair_end_failed", error.code ?? "");
  }
  redirect(`${BACK}?notice=ended`);
}

export interface NudgeState {
  ok: boolean;
  message: string | null;
}

/** Send one pre-written nudge. The code is checked here and in the database; there is no free text. */
export async function sendNudge(pairId: string, code: string): Promise<NudgeState> {
  const session = await getReaderSession();
  if (!session) return { ok: false, message: "Sign in first." };
  if (!UUID.test(pairId) || !isNudgeCode(code)) return { ok: false, message: "That nudge is not available." };
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("send_nudge", { p_pair: pairId, p_code: code });
  if (error) {
    console.error("pair_nudge_failed", error.code ?? "");
    return { ok: false, message: "It could not be sent just now. Try again in a moment." };
  }
  switch (data) {
    case "sent":
      await announceFinishForPair(pairId);
      return { ok: true, message: "Sent." };
    case "limit":
      return { ok: false, message: "You have already sent one today." };
    case "already_finished":
      return { ok: false, message: "They have already done a step today." };
    case "not_yet":
      return { ok: false, message: "That one is for after they have done a step." };
    default:
      return { ok: false, message: "That nudge is not available." };
  }
}
