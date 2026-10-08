"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getReaderSession } from "@/lib/auth";
import { hasCurrentFaithConsent } from "@/lib/consent";
import { groupErrorNotice, isCheckinChoice, isUuidLike, parseConcern, withNotice, type GroupNotice } from "@/lib/org-groups";
import { createUserClient } from "@/lib/supabase/server";

/**
 * The member's group actions (F-210, F-211, F-213, F-215, F-216). Each one
 * is a 0028 function that acts for the signed-in person only. Joining and
 * accepting a leader role check the faith consent wording is current first,
 * so a church group never stores a membership without it.
 */

const PAGE = "/groups";

function to(notice: GroupNotice, path: string = PAGE): never {
  redirect(withNotice(path, notice));
}

async function signedIn() {
  const session = await getReaderSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(PAGE)}`);
  return session;
}

async function faithConsentIsCurrent(userId: string): Promise<boolean> {
  const supabase = await createUserClient();
  const { data } = await supabase.from("profiles").select("faith_consent_at, faith_consent_version").eq("user_id", userId).maybeSingle();
  return hasCurrentFaithConsent({
    consentAt: (data?.faith_consent_at as string | null | undefined) ?? null,
    consentVersion: (data?.faith_consent_version as string | null | undefined) ?? null,
  });
}

/** Join from a seat, or accept a leader appointment. */
export async function joinGroup(formData: FormData): Promise<void> {
  const session = await signedIn();
  const id = String(formData.get("group") ?? "");
  if (!isUuidLike(id)) to("invalid");
  const supabase = await createUserClient();
  const [joinable, mine] = await Promise.all([supabase.rpc("my_joinable_org_groups"), supabase.rpc("my_org_groups")]);
  const row =
    ((joinable.data ?? []) as { group_id: string; faith: boolean }[]).find((g) => g.group_id === id) ??
    ((mine.data ?? []) as { group_id: string; faith: boolean }[]).find((g) => g.group_id === id);
  if (!row) to("denied");
  if (row.faith && !(await faithConsentIsCurrent(session.userId))) {
    redirect(`/consent/faith?next=${encodeURIComponent(PAGE)}`);
  }
  const { data, error } = await supabase.rpc("org_group_join", { p_group: id });
  if (error) {
    console.error("org_group_join_failed", error.code ?? "");
    if (error.code === "AKG03") redirect(`/consent/faith?next=${encodeURIComponent(PAGE)}`);
    to(groupErrorNotice(error.code));
  }
  revalidatePath(PAGE);
  to(data === "accepted" ? "accepted" : "joined");
}

/** Leave the group, or say no to a leader appointment. */
export async function leaveGroup(formData: FormData): Promise<void> {
  await signedIn();
  const id = String(formData.get("group") ?? "");
  if (!isUuidLike(id) || formData.get("confirm") !== "yes") to("invalid");
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("org_group_leave", { p_group: id });
  if (error) {
    console.error("org_group_leave_failed", error.code ?? "");
    to(groupErrorNotice(error.code));
  }
  revalidatePath(PAGE);
  to("left");
}

/** Say no to a leader appointment. A member stays a member. */
export async function declineOffer(formData: FormData): Promise<void> {
  await signedIn();
  const id = String(formData.get("group") ?? "");
  if (!isUuidLike(id)) to("invalid");
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("org_group_decline_offer", { p_group: id });
  if (error) {
    console.error("org_group_decline_failed", error.code ?? "");
    to(groupErrorNotice(error.code));
  }
  revalidatePath(PAGE);
  to("declined");
}

export async function checkIn(formData: FormData): Promise<void> {
  await signedIn();
  const id = String(formData.get("group") ?? "");
  const unit = Number(formData.get("unit"));
  const choice = formData.get("choice");
  if (!isUuidLike(id) || !Number.isInteger(unit) || unit < 1 || !isCheckinChoice(choice)) to("invalid");
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("org_group_checkin", { p_group: id, p_unit: unit, p_choice: choice });
  if (error) {
    console.error("org_group_checkin_failed", error.code ?? "");
    if (error.code === "AKG03") redirect(`/consent/faith?next=${encodeURIComponent(PAGE)}`);
    to(groupErrorNotice(error.code));
  }
  revalidatePath(PAGE);
  to("checked_in");
}

export async function setCounting(formData: FormData): Promise<void> {
  await signedIn();
  const id = String(formData.get("group") ?? "");
  const count = formData.get("count") === "yes";
  if (!isUuidLike(id)) to("invalid");
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("org_group_set_counting", { p_group: id, p_count: count });
  if (error) {
    console.error("org_group_counting_failed", error.code ?? "");
    to(groupErrorNotice(error.code));
  }
  revalidatePath(PAGE);
  to(count ? "counting_on" : "counting_off");
}

export async function clearCheckins(formData: FormData): Promise<void> {
  await signedIn();
  const id = String(formData.get("group") ?? "");
  if (!isUuidLike(id) || formData.get("confirm") !== "yes") to("invalid");
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("org_group_clear_my_checkins", { p_group: id });
  if (error) {
    console.error("org_group_clear_failed", error.code ?? "");
    to(groupErrorNotice(error.code));
  }
  revalidatePath(PAGE);
  to("cleared");
}

/** Report a concern about the group to Akana support (F-216). Never the leader. */
export async function reportConcern(formData: FormData): Promise<void> {
  await signedIn();
  const id = String(formData.get("group") ?? "");
  const back = `/groups/concern?group=${encodeURIComponent(id)}`;
  if (!isUuidLike(id)) to("invalid");
  const parsed = parseConcern((k) => formData.get(k));
  if (!parsed.ok) to("invalid", back);
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("org_group_report_concern", { p_group: id, p_message: parsed.value.message, p_consent: true });
  if (error) {
    console.error("org_group_concern_failed", error.code ?? "");
    to(groupErrorNotice(error.code), back);
  }
  to("concern_sent");
}
