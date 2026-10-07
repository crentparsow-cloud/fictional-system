"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { adminAbilities } from "@/lib/admin/permissions";
import { originFrom } from "@/lib/partner";
import { getStaffSession } from "@/lib/staff";
import { bioClaimFlags, cleanEmail, isUuid, parseOrgRole, str, studioErrorNotice, type StudioNotice } from "@/lib/studio";
import { sendOrgInvite } from "@/lib/studio-server";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Staff side of author onboarding (F-033, F-034, F-036). Platform owners and
 * editors invite the first person to an organisation, review bios and check
 * signed licence uploads. The 0013 functions check the staff role again and
 * write the audit row.
 */

const HOME = "/admin/authors";

function back(notice: StudioNotice): never {
  redirect(`${HOME}?notice=${notice}`);
}

async function staffWriter() {
  const staff = await getStaffSession(HOME);
  if (!adminAbilities(staff.roles).createOrganisations) back("denied");
  return staff;
}

export async function staffInvite(formData: FormData): Promise<void> {
  await staffWriter();
  const org = String(formData.get("org") ?? "");
  const email = cleanEmail(formData.get("email"));
  const role = parseOrgRole(formData.get("role"));
  if (!isUuid(org) || !email || !role) back("invalid");
  const supabase = await createUserClient();
  const { data } = await supabase.from("organisations").select("display_name, kind").eq("id", org).maybeSingle();
  if (!data || data.kind === "akana_house") back("invalid");
  const notice = await sendOrgInvite({
    origin: originFrom(await headers()),
    orgId: org,
    orgName: data.display_name as string,
    email,
    role,
    inviter: "The Akana team",
  });
  revalidatePath(HOME);
  back(notice);
}

export async function reviewBio(formData: FormData): Promise<void> {
  await staffWriter();
  const author = String(formData.get("author") ?? "");
  const approve = formData.get("decision") === "approve";
  if (!isUuid(author)) back("invalid");
  const supabase = await createUserClient();
  // Flags are worked out again here from the text itself, not taken from what the author's page stored.
  const { data } = await supabase.rpc("staff_pending_bios");
  const row = ((data ?? []) as { author_id: string; bio_draft: string | null }[]).find((r) => r.author_id === author);
  if (!row) back("failed");
  const flags = bioClaimFlags(row.bio_draft ?? "");
  const { error } = await supabase.rpc("author_bio_review", {
    p_author: author,
    p_approve: approve,
    p_flag_count: flags.length,
    p_reason: str(formData.get("reason"), 500) || null,
  });
  if (error) back(studioErrorNotice(error.code, error.message));
  revalidatePath(HOME);
  back("saved");
}

export async function verifyLicence(formData: FormData): Promise<void> {
  await staffWriter();
  const licence = String(formData.get("licence") ?? "");
  if (!isUuid(licence)) back("invalid");
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("licence_verify", {
    p_licence: licence,
    p_accept: formData.get("decision") === "accept",
    p_reason: str(formData.get("reason"), 500) || null,
  });
  if (error) back(studioErrorNotice(error.code, error.message));
  revalidatePath(HOME);
  back("saved");
}
