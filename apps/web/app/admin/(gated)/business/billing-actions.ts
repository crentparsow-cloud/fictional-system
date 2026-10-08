"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminAbilities } from "@/lib/admin/permissions";
import { isOrgPlanId } from "@/lib/org-billing";
import { startLicenceBilling } from "@/lib/org-billing-server";
import { getStaffSession } from "@/lib/staff";

/**
 * Staff start Stripe billing for a licence (F-220). TEST MODE ONLY. 0030's
 * org_billing_link_check refuses pilots, ended licences and licences that
 * are already billed; the webhook then links the subscription.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function startBilling(formData: FormData): Promise<void> {
  const org = String(formData.get("org") ?? "");
  const licence = String(formData.get("licence") ?? "");
  if (!UUID.test(org)) redirect("/admin/business");
  const path = `/admin/business/${org}`;
  const staff = await getStaffSession(path);
  if (!adminAbilities(staff.roles).createOrganisations) redirect(`${path}?billing=denied`);
  const plan = String(formData.get("plan") ?? "");
  const po = String(formData.get("po_number") ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").trim().slice(0, 60);
  if (!UUID.test(licence) || !isOrgPlanId(plan) || formData.get("confirm") !== "yes") redirect(`${path}?billing=invalid`);
  const notice = await startLicenceBilling({ licenceId: licence, plan, poNumber: po || null });
  revalidatePath(path);
  redirect(`${path}?billing=${notice}`);
}
