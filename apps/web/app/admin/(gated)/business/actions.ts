"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminAbilities } from "@/lib/admin/permissions";
import { originFrom } from "@/lib/partner";
import {
  cleanInviteEmail,
  dateInputToIso,
  orgErrorNotice,
  parseCustomerOrgForm,
  parseInvoiceRef,
  parseLicenceForm,
  parseSeats,
  parseTitleIds,
  SIZE_BANDS,
  type OrgNotice,
} from "@/lib/org-pilot";
import { sendAdminInvite } from "@/lib/org-pilot-server";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Staff actions for customer organisations (F-201, F-202). The licence is
 * recorded by hand once the organisation has agreed terms; the invoice is
 * raised outside the app and only its reference is kept. Every call goes
 * through a 0024 function that checks the staff role again and audits.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function staffWriter(path: string) {
  const staff = await getStaffSession(path);
  if (!adminAbilities(staff.roles).createOrganisations) redirect(`${path}?notice=denied`);
  return staff;
}

function to(path: string, notice: OrgNotice): never {
  redirect(`${path}?notice=${notice}`);
}

export async function createCustomerOrganisation(formData: FormData): Promise<void> {
  await staffWriter("/admin/business");
  const parsed = parseCustomerOrgForm((k) => formData.get(k));
  if (!parsed.ok) to("/admin/business", "invalid");
  const v = parsed.value;
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("create_customer_organisation", {
    p_kind: v.kind,
    p_display_name: v.display_name,
    p_legal_name: v.legal_name,
    p_country: v.country,
    p_slug: v.slug,
    p_size_band: v.size_band,
    p_sector: v.sector,
    p_charity_number: v.charity_number,
    p_vat_number: v.vat_number,
    p_billing_name: v.billing_name,
    p_billing_email: v.billing_email,
    p_billing_country: null,
  });
  if (error || typeof data !== "string") {
    console.error("admin_customer_create_failed", error?.code ?? "");
    to("/admin/business", orgErrorNotice(error?.code));
  }
  revalidatePath("/admin/business");
  to(`/admin/business/${data}`, "created");
}

export async function saveCustomerProfile(formData: FormData): Promise<void> {
  const org = String(formData.get("org") ?? "");
  if (!UUID.test(org)) to("/admin/business", "invalid");
  const path = `/admin/business/${org}`;
  await staffWriter(path);
  const size = String(formData.get("size_band") ?? "");
  const str = (k: string, max: number) => String(formData.get(k) ?? "").trim().slice(0, max) || null;
  const email = String(formData.get("billing_email") ?? "").trim();
  const billingEmail = email ? cleanInviteEmail(email) : null;
  if ((size && !(SIZE_BANDS as readonly string[]).includes(size)) || (email && !billingEmail)) to(path, "invalid");
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("org_profile_save", {
    p_org: org,
    p_size_band: size || null,
    p_sector: str("sector", 80),
    p_charity_number: str("charity_number", 20),
    p_vat_number: str("vat_number", 20),
    p_billing_name: str("billing_name", 120),
    p_billing_email: billingEmail,
    p_billing_country: (str("billing_country", 2) ?? "").toUpperCase() || null,
  });
  if (error) to(path, orgErrorNotice(error.code));
  revalidatePath(path);
  to(path, "saved");
}

export async function inviteCustomerAdmin(formData: FormData): Promise<void> {
  const org = String(formData.get("org") ?? "");
  if (!UUID.test(org)) to("/admin/business", "invalid");
  const path = `/admin/business/${org}`;
  await staffWriter(path);
  const email = cleanInviteEmail(formData.get("email"));
  if (!email) to(path, "invalid");
  const supabase = await createUserClient();
  const { data: o } = await supabase.from("organisations").select("display_name").eq("id", org).maybeSingle();
  if (!o) to(path, "invalid");
  const notice = await sendAdminInvite({ origin: originFrom(await headers()), orgId: org, orgName: o.display_name as string, email });
  revalidatePath(path);
  to(path, notice);
}

export async function createLicence(formData: FormData): Promise<void> {
  const org = String(formData.get("org") ?? "");
  if (!UUID.test(org)) to("/admin/business", "invalid");
  const path = `/admin/business/${org}`;
  await staffWriter(path);
  const parsed = parseLicenceForm(
    (k) => formData.get(k),
    (k) => formData.getAll(k),
  );
  if (!parsed.ok) to(path, "invalid");
  const v = parsed.value;
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("org_licence_create", {
    p_org: org,
    p_kind: v.kind,
    p_title_scope: v.title_scope,
    p_seats: v.seats,
    p_starts_at: v.starts_at,
    p_ends_at: v.ends_at,
    p_invoice_ref: v.invoice_ref,
    p_titles: v.title_scope === "list" ? v.titles : null,
  });
  if (error) {
    console.error("admin_licence_create_failed", error.code ?? "");
    to(path, orgErrorNotice(error.code));
  }
  revalidatePath(path);
  to(path, "licence_created");
}

export async function updateLicence(formData: FormData): Promise<void> {
  const org = String(formData.get("org") ?? "");
  const licence = String(formData.get("licence") ?? "");
  if (!UUID.test(org) || !UUID.test(licence)) to("/admin/business", "invalid");
  const path = `/admin/business/${org}`;
  await staffWriter(path);
  const seats = parseSeats(formData.get("seats"));
  const starts = dateInputToIso(String(formData.get("starts_on") ?? ""));
  const ends = dateInputToIso(String(formData.get("ends_on") ?? ""));
  const ref = parseInvoiceRef(formData.get("invoice_ref"));
  const status = String(formData.get("status") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500);
  if (seats === null || !starts || !ends || ends <= starts || ref === false || !["active", "suspended", "ended"].includes(status) || !reason) {
    to(path, "invalid");
  }
  if (status === "ended" && formData.get("confirm_end") !== "yes") to(path, "invalid");
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("org_licence_update", {
    p_licence: licence,
    p_seats: seats,
    p_starts_at: starts,
    p_ends_at: ends,
    p_invoice_ref: ref,
    p_status: status,
    p_reason: reason,
  });
  if (error) {
    console.error("admin_licence_update_failed", error.code ?? "");
    to(path, orgErrorNotice(error.code));
  }
  revalidatePath(path);
  to(path, "licence_saved");
}

export async function setLicenceTitles(formData: FormData): Promise<void> {
  const org = String(formData.get("org") ?? "");
  const licence = String(formData.get("licence") ?? "");
  if (!UUID.test(org) || !UUID.test(licence)) to("/admin/business", "invalid");
  const path = `/admin/business/${org}`;
  await staffWriter(path);
  const titles = parseTitleIds(formData.getAll("titles"));
  if (!titles || titles.length === 0) to(path, "invalid");
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("org_licence_set_titles", { p_licence: licence, p_titles: titles });
  if (error) to(path, orgErrorNotice(error.code));
  revalidatePath(path);
  to(path, "titles_saved");
}
