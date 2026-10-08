"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getReaderSession } from "@/lib/auth";
import { hitSelf } from "@/lib/limits";
import { parseSignupForm } from "@/lib/org-billing";
import { startSelfServeCheckout } from "@/lib/org-billing-server";
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
