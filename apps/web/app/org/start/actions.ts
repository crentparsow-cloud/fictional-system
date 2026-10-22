"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getReaderSession } from "@/lib/auth";
import { hitSelf } from "@/lib/limits";
import { parseSignupForm } from "@/lib/org-billing";
import { startSelfServeCheckout } from "@/lib/org-billing-server";
import { CHURCH_BAND_IDS, SMALL_ORG_PLAN, parseChurchForm, parseGroupLicenceForm, parseSmallOrgForm, priceOf } from "@/lib/org-plans";
import { loadPackTitles, loadPlanPrices, startChurchCheckout, startGroupLicenceCheckout, startSmallOrgCheckout } from "@/lib/org-plans-server";
import { originFrom } from "@/lib/partner";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Self-serve sign-up for the Group and small Teams plans (F-226). Behind
 * the org_self_serve flag, which 0030 seeds off: while it is off, or while
 * the plan's price id is unset, nothing reaches Stripe.
 */
export async function startSignup(formData: FormData): Promise<void> {
  const session = await getReaderSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent("/org/start")}`);
  const input = parseSignupForm((k) => formData.get(k));
  if (!input) redirect("/org/start?e=invalid");
  const supabase = await createUserClient();
  // The same hourly Checkout limit as reader checkout (0027).
  if (!(await hitSelf(supabase, "checkout_user"))) redirect("/org/start?e=limited");
  const out = await startSelfServeCheckout({ userId: session.userId, email: session.email ?? null, origin: originFrom(await headers()), input });
  if (typeof out === "string") redirect(`/org/start?e=${out}`);
  redirect(out.url);
}

async function gate(): Promise<{ userId: string; email: string | null; origin: string }> {
  const session = await getReaderSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent("/org/start")}`);
  const supabase = await createUserClient();
  if (!(await hitSelf(supabase, "checkout_user"))) redirect("/org/start?e=limited");
  return { userId: session.userId, email: session.email ?? null, origin: originFrom(await headers()) };
}

function finish(out: string | { url: string }): never {
  if (typeof out === "string") redirect(`/org/start?e=${out}`);
  redirect(out.url);
}

/** Small organisation: 5 to 50 seats, one annual payment, seat bounds from the price table. */
export async function startSmallOrg(formData: FormData): Promise<void> {
  const who = await gate();
  const price = priceOf(await loadPlanPrices(), SMALL_ORG_PLAN);
  if (!price) redirect("/org/start?e=invalid");
  const parsed = parseSmallOrgForm((k) => formData.get(k), price);
  if (!parsed.ok) redirect("/org/start?e=invalid");
  finish(await startSmallOrgCheckout({ ...who, input: parsed.value }));
}

/** Church: the organiser picks their own attendance band. Members are unlimited. */
export async function startChurch(formData: FormData): Promise<void> {
  const who = await gate();
  const onSale = (await loadPlanPrices()).filter((p) => (CHURCH_BAND_IDS as readonly string[]).includes(p.id));
  const parsed = parseChurchForm((k) => formData.get(k), onSale);
  if (!parsed.ok) redirect("/org/start?e=invalid");
  finish(await startChurchCheckout({ ...who, input: parsed.value }));
}

/** Six-seat group licence for one workbook. One payment. */
export async function startGroupLicence(formData: FormData): Promise<void> {
  const who = await gate();
  const titles = await loadPackTitles();
  const parsed = parseGroupLicenceForm((k) => formData.get(k), titles.map((t) => t.id));
  if (!parsed.ok) redirect("/org/start?e=invalid");
  finish(await startGroupLicenceCheckout({ ...who, input: parsed.value }));
}
