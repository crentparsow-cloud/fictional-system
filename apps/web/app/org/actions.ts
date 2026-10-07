"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { hashToken, isTokenShaped, originFrom } from "@/lib/partner";
import { claimErrorCode, cleanInviteEmail, orgErrorNotice, type OrgNotice } from "@/lib/org-pilot";
import { requireOrgConsole, sendSeatInvite, withOrgParam } from "@/lib/org-pilot-server";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Organisation console and invitation actions (F-203, F-204). Every write
 * goes through a 0024 function, which checks the role again, holds or frees
 * a place on the licence, and writes the audit row.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function back(notice: OrgNotice, orgId: string, multi: boolean): never {
  const p = withOrgParam("/org", orgId, multi);
  redirect(`${p}${p.includes("?") ? "&" : "?"}notice=${notice}`);
}

/** The licence must belong to the organisation being shown; RLS checks again. */
async function licenceOf(orgId: string, licenceId: string): Promise<boolean> {
  if (!UUID.test(licenceId)) return false;
  const supabase = await createUserClient();
  const { data } = await supabase.from("org_licences").select("id").eq("id", licenceId).eq("org_id", orgId).maybeSingle();
  return !!data;
}

export async function inviteToSeat(formData: FormData): Promise<void> {
  const ctx = await requireOrgConsole("/org", String(formData.get("org") ?? ""));
  const licence = String(formData.get("licence") ?? "");
  const email = cleanInviteEmail(formData.get("email"));
  if (!email || !(await licenceOf(ctx.org.id, licence))) back("invalid", ctx.org.id, ctx.multi);
  const notice = await sendSeatInvite({ origin: originFrom(await headers()), licenceId: licence, orgName: ctx.org.displayName, email });
  revalidatePath("/org");
  back(notice, ctx.org.id, ctx.multi);
}

export async function resendSeatInvite(formData: FormData): Promise<void> {
  const ctx = await requireOrgConsole("/org", String(formData.get("org") ?? ""));
  const id = String(formData.get("invite") ?? "");
  if (!UUID.test(id)) back("invalid", ctx.org.id, ctx.multi);
  const supabase = await createUserClient();
  const { data } = await supabase.from("org_seat_invitations").select("email, licence_id").eq("id", id).eq("org_id", ctx.org.id).maybeSingle();
  const email = cleanInviteEmail(data?.email);
  if (!data || !email) back("state", ctx.org.id, ctx.multi);
  const notice = await sendSeatInvite({
    origin: originFrom(await headers()),
    licenceId: data.licence_id as string,
    orgName: ctx.org.displayName,
    email,
    resendId: id,
  });
  revalidatePath("/org");
  back(notice, ctx.org.id, ctx.multi);
}

export async function revokeSeatInvite(formData: FormData): Promise<void> {
  const ctx = await requireOrgConsole("/org", String(formData.get("org") ?? ""));
  const id = String(formData.get("invite") ?? "");
  if (!UUID.test(id)) back("invalid", ctx.org.id, ctx.multi);
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("org_seat_invite_revoke", { p_invite: id });
  if (error) back(orgErrorNotice(error.code), ctx.org.id, ctx.multi);
  revalidatePath("/org");
  back("revoked", ctx.org.id, ctx.multi);
}

export async function releaseSeat(formData: FormData): Promise<void> {
  const ctx = await requireOrgConsole("/org", String(formData.get("org") ?? ""));
  const id = String(formData.get("seat") ?? "");
  if (!UUID.test(id) || formData.get("confirm") !== "yes") back("invalid", ctx.org.id, ctx.multi);
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("org_seat_release", { p_seat: id });
  if (error) back(orgErrorNotice(error.code), ctx.org.id, ctx.multi);
  revalidatePath("/org");
  back("released", ctx.org.id, ctx.multi);
}

// ---------------------------------------------------------------------------
// The invitation link
// ---------------------------------------------------------------------------

export async function claimSeat(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  if (!isTokenShaped(token)) redirect("/");
  const path = `/org/join/${token}`;
  const supabase = await createUserClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) redirect(`/sign-in?next=${encodeURIComponent(path)}`);
  const { error } = await supabase.rpc("org_seat_claim", { p_token_hash: await hashToken(token), p_adult: formData.get("adult") === "yes" });
  if (error) {
    console.error("org_seat_claim_failed", error.code ?? "");
    redirect(`${path}?e=${claimErrorCode(error.code)}`);
  }
  revalidatePath("/library");
  redirect(`${path}?done=claimed`);
}

export async function declineSeat(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  if (!isTokenShaped(token)) redirect("/");
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("org_seat_decline", { p_token_hash: await hashToken(token) });
  if (error) console.error("org_seat_decline_failed", error.code ?? "");
  redirect(`/org/join/${token}?done=${data === "declined" || data === "already" ? "declined" : "failed"}`);
}

/** The person Akana staff invited to run a customer organisation (0013 invitation). */
export async function acceptAdminInvite(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  if (!isTokenShaped(token)) redirect("/");
  const path = `/org/admin-join/${token}`;
  const supabase = await createUserClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) redirect(`/sign-in?next=${encodeURIComponent(path)}`);
  const { error } = await supabase.rpc("org_invite_accept", { p_token_hash: await hashToken(token) });
  if (error) {
    console.error("org_admin_accept_failed", error.code ?? "");
    redirect(`${path}?e=${error.code === "AKS03" ? "other-address" : error.code === "AKS04" ? "closed" : "failed"}`);
  }
  revalidatePath("/org");
  redirect("/org");
}
