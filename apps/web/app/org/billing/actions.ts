"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { BillingNotice } from "@/lib/org-billing";
import { changeLicenceSeats, endLicence } from "@/lib/org-billing-server";
import { requireOrgConsole, withOrgParam } from "@/lib/org-pilot-server";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Billing actions for the organisation (F-220, F-228). Each one asks a 0030
 * function whether the caller may before Stripe is touched; the database
 * then follows Stripe through the webhook.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function back(notice: BillingNotice, orgId: string, multi: boolean): never {
  const p = withOrgParam("/org/billing", orgId, multi);
  redirect(`${p}${p.includes("?") ? "&" : "?"}notice=${notice}`);
}

/** The licence and its Stripe subscription, if the caller's organisation holds it (RLS checks again). */
async function licenceAndSub(orgId: string, licenceId: string): Promise<{ sub: string | null; subStatus: string | null } | null> {
  if (!UUID.test(licenceId)) return null;
  const supabase = await createUserClient();
  const { data: lic } = await supabase.from("org_licences").select("id").eq("id", licenceId).eq("org_id", orgId).maybeSingle();
  if (!lic) return null;
  const { data: sub } = await supabase.from("org_subscriptions").select("stripe_subscription_id, status").eq("licence_id", licenceId).maybeSingle();
  return {
    sub: (sub?.stripe_subscription_id as string | undefined) ?? null,
    subStatus: (sub?.status as string | undefined) ?? null,
  };
}

export async function changeSeats(formData: FormData): Promise<void> {
  const ctx = await requireOrgConsole("/org/billing", String(formData.get("org") ?? ""));
  const licence = String(formData.get("licence") ?? "");
  const raw = String(formData.get("quantity") ?? "").trim();
  const quantity = /^\d{1,5}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) back("invalid", ctx.org.id, ctx.multi);
  const found = await licenceAndSub(ctx.org.id, licence);
  if (!found?.sub) back("state", ctx.org.id, ctx.multi);
  const notice = await changeLicenceSeats({ licenceId: licence, subscriptionId: found.sub, quantity });
  revalidatePath("/org/billing");
  back(notice, ctx.org.id, ctx.multi);
}

export async function endLicenceAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgConsole("/org/billing", String(formData.get("org") ?? ""));
  if (ctx.org.role !== "owner") back("denied", ctx.org.id, ctx.multi);
  if (formData.get("confirm") !== "yes") back("invalid", ctx.org.id, ctx.multi);
  const licence = String(formData.get("licence") ?? "");
  const found = await licenceAndSub(ctx.org.id, licence);
  if (!found) back("invalid", ctx.org.id, ctx.multi);
  const live = found.sub && found.subStatus !== "canceled" && found.subStatus !== "incomplete_expired" ? found.sub : null;
  const notice = await endLicence({ licenceId: licence, subscriptionId: live });
  revalidatePath("/org/billing");
  revalidatePath("/org");
  back(notice, ctx.org.id, ctx.multi);
}
