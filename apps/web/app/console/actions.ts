"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { originFrom } from "@/lib/partner";
import { cleanEmail, isUuid, OWNER_GRANTABLE_ROLES, parseOrgRole, str, studioErrorNotice, withOrg, type StudioNotice } from "@/lib/studio";
import { inviterName, requireStudio, sendOrgInvite } from "@/lib/studio-server";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Organisation console actions (F-055, F-056). Owners invite, resend,
 * revoke, change roles and remove members; owners and editors keep the
 * author roster and imprints. The 0013 functions check the role again,
 * keep one owner, leave ownership changes to staff and write the audit row.
 */

function back(path: string, notice: StudioNotice, orgId: string, multi: boolean): never {
  const p = withOrg(path, orgId, multi);
  redirect(`${p}${p.includes("?") ? "&" : "?"}notice=${notice}`);
}

export async function inviteMember(formData: FormData): Promise<void> {
  const ctx = await requireStudio("/console", String(formData.get("org") ?? ""));
  const home = String(formData.get("from") ?? "") === "authors" ? "/console/authors" : "/console";
  const email = cleanEmail(formData.get("email"));
  const role = parseOrgRole(formData.get("role"));
  const author = String(formData.get("author") ?? "");
  if (!email || !role || !OWNER_GRANTABLE_ROLES.includes(role)) back(home, "invalid", ctx.org.id, ctx.multi);
  const notice = await sendOrgInvite({
    origin: originFrom(await headers()),
    orgId: ctx.org.id,
    orgName: ctx.org.displayName,
    email,
    role,
    authorId: isUuid(author) ? author : null,
    inviter: await inviterName(`A colleague at ${ctx.org.displayName}`),
  });
  revalidatePath(home);
  back(home, notice, ctx.org.id, ctx.multi);
}

export async function resendInvite(formData: FormData): Promise<void> {
  const ctx = await requireStudio("/console", String(formData.get("org") ?? ""));
  const id = String(formData.get("invite") ?? "");
  if (!isUuid(id)) back("/console", "invalid", ctx.org.id, ctx.multi);
  const supabase = await createUserClient();
  const { data } = await supabase.from("org_invitations").select("email, role").eq("id", id).eq("org_id", ctx.org.id).maybeSingle();
  const role = parseOrgRole(data?.role);
  if (!data || !role) back("/console", "denied", ctx.org.id, ctx.multi);
  const notice = await sendOrgInvite({
    origin: originFrom(await headers()),
    orgId: ctx.org.id,
    orgName: ctx.org.displayName,
    email: data.email as string,
    role,
    inviter: await inviterName(`A colleague at ${ctx.org.displayName}`),
    resendId: id,
  });
  revalidatePath("/console");
  back("/console", notice, ctx.org.id, ctx.multi);
}

export async function revokeInvite(formData: FormData): Promise<void> {
  const ctx = await requireStudio("/console", String(formData.get("org") ?? ""));
  const id = String(formData.get("invite") ?? "");
  if (!isUuid(id)) back("/console", "invalid", ctx.org.id, ctx.multi);
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("org_invite_revoke", { p_invite: id });
  if (error) back("/console", studioErrorNotice(error.code, error.message), ctx.org.id, ctx.multi);
  revalidatePath("/console");
  back("/console", "revoked", ctx.org.id, ctx.multi);
}

export async function setMemberRole(formData: FormData): Promise<void> {
  const ctx = await requireStudio("/console", String(formData.get("org") ?? ""));
  const user = String(formData.get("user") ?? "");
  const role = parseOrgRole(formData.get("role"));
  if (!isUuid(user) || !role) back("/console", "invalid", ctx.org.id, ctx.multi);
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("org_member_set_role", { p_org: ctx.org.id, p_user: user, p_role: role });
  if (error) back("/console", studioErrorNotice(error.code, error.message), ctx.org.id, ctx.multi);
  revalidatePath("/console");
  back("/console", "role-changed", ctx.org.id, ctx.multi);
}

/** Removal takes effect on the member's next request: every policy reads org_members live. */
export async function removeMember(formData: FormData): Promise<void> {
  const ctx = await requireStudio("/console", String(formData.get("org") ?? ""));
  const user = String(formData.get("user") ?? "");
  if (!isUuid(user) || formData.get("confirm") !== "yes") back("/console", "invalid", ctx.org.id, ctx.multi);
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("org_member_remove", { p_org: ctx.org.id, p_user: user });
  if (error) back("/console", studioErrorNotice(error.code, error.message), ctx.org.id, ctx.multi);
  revalidatePath("/console");
  back("/console", "removed", ctx.org.id, ctx.multi);
}

export async function addRosterAuthor(formData: FormData): Promise<void> {
  const ctx = await requireStudio("/console/authors", String(formData.get("org") ?? ""));
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("author_save", {
    p_org: ctx.org.id,
    p_author: null,
    p_display_name: str(formData.get("display_name"), 120),
    p_legal_name: str(formData.get("legal_name"), 200) || null,
    p_country: str(formData.get("country"), 2).toUpperCase(),
    p_website: null,
    p_links: [],
    p_spelling: formData.get("spelling") === "en-US" ? "en-US" : "en-GB",
    p_photo_rights: false,
    p_link_self: false,
  });
  if (error) back("/console/authors", studioErrorNotice(error.code, error.message), ctx.org.id, ctx.multi);
  revalidatePath("/console/authors");
  back("/console/authors", "saved", ctx.org.id, ctx.multi);
}

export async function saveImprint(formData: FormData): Promise<void> {
  const ctx = await requireStudio("/console/authors", String(formData.get("org") ?? ""));
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("imprint_save", { p_org: ctx.org.id, p_name: str(formData.get("name"), 120) });
  if (error) back("/console/authors", studioErrorNotice(error.code, error.message), ctx.org.id, ctx.multi);
  revalidatePath("/console/authors");
  back("/console/authors", "saved", ctx.org.id, ctx.multi);
}
