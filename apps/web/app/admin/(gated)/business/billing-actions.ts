"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminAbilities } from "@/lib/admin/permissions";
import { billingErrorNotice, isBandPlan, isOrgPlanId } from "@/lib/org-billing";
import { changeLicenceBand, startLicenceBilling } from "@/lib/org-billing-server";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";

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

const reasonOf = (v: FormDataEntryValue | null) => String(v ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").trim().slice(0, 500);

/**
 * Staff change a church band, overriding the organisation's limits (0031):
 * past due or ending, below the band's size, or without proration. A reason
 * is required and audited.
 */
export async function overrideBand(formData: FormData): Promise<void> {
  const org = String(formData.get("org") ?? "");
  const licence = String(formData.get("licence") ?? "");
  if (!UUID.test(org)) redirect("/admin/business");
  const path = `/admin/business/${org}`;
  const staff = await getStaffSession(path);
  if (!staff.roles.some((r) => r === "owner" || r === "editor" || r === "finance")) redirect(`${path}?billing=denied`);
  const plan = String(formData.get("plan") ?? "");
  const reason = reasonOf(formData.get("reason"));
  if (!UUID.test(licence) || !isBandPlan(plan) || !reason) redirect(`${path}?billing=invalid`);
  const supabase = await createUserClient();
  const { data: sub } = await supabase.from("org_subscriptions").select("stripe_subscription_id").eq("licence_id", licence).maybeSingle();
  if (!sub?.stripe_subscription_id) redirect(`${path}?billing=state`);
  const notice = await changeLicenceBand({
    licenceId: licence,
    subscriptionId: String(sub.stripe_subscription_id),
    plan,
    staff: { reason, prorate: formData.get("prorate") === "yes" },
  });
  revalidatePath(path);
  redirect(`${path}?billing=${notice}`);
}

/** Staff record whether a customer buys as a consumer or a business (0031). */
export async function setBuyerType(formData: FormData): Promise<void> {
  const org = String(formData.get("org") ?? "");
  if (!UUID.test(org)) redirect("/admin/business");
  const path = `/admin/business/${org}`;
  const staff = await getStaffSession(path);
  if (!adminAbilities(staff.roles).createOrganisations) redirect(`${path}?billing=denied`);
  const type = String(formData.get("buyer_type") ?? "");
  const reason = reasonOf(formData.get("reason"));
  if ((type !== "consumer" && type !== "business") || !reason) redirect(`${path}?billing=invalid`);
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("org_set_buyer_type", { p_org: org, p_type: type, p_reason: reason });
  revalidatePath(path);
  redirect(`${path}?billing=${error ? billingErrorNotice(error.code) : "buyer_saved"}`);
}
