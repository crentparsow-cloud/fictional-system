"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseOrganisationForm } from "@/lib/admin/organisations";
import { adminAbilities, ORGANISATION_INSERT_ALLOWED } from "@/lib/admin/permissions";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Create an organisation (F-082) through public.create_organisation
 * (migration 0008). The function admits platform owners and editors, refuses
 * akana_house, mints the PB- or AU- code and writes the audit row. There is
 * still no insert grant on the table, so this is the only client path.
 */
export async function createOrganisation(formData: FormData): Promise<void> {
  const staff = await getStaffSession("/admin/organisations");
  if (!ORGANISATION_INSERT_ALLOWED || !adminAbilities(staff.roles).createOrganisations) {
    redirect("/admin/organisations?notice=denied");
  }

  const parsed = parseOrganisationForm((k) => formData.get(k));
  if (!parsed.ok) redirect("/admin/organisations?notice=org_invalid");
  const v = parsed.value;

  const supabase = await createUserClient();
  const { error } = await supabase.rpc("create_organisation", {
    p_kind: v.kind,
    p_display_name: v.display_name,
    p_legal_name: v.legal_name,
    p_country: v.country,
    p_slug: v.slug,
  });
  if (error) {
    console.error("admin_org_create_failed", error.code ?? "");
    const notice =
      error.code === "42501" ? "denied" : error.code === "23505" ? "org_slug" : error.code === "23514" ? "org_invalid" : "failed";
    redirect(`/admin/organisations?notice=${notice}`);
  }

  revalidatePath("/admin/organisations");
  revalidatePath("/admin");
  redirect("/admin/organisations?notice=created");
}
