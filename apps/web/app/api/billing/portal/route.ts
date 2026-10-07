import { NextResponse, type NextRequest } from "next/server";
import { getReaderSession } from "@/lib/auth";
import { portalCustomerId, type SubscriptionRow } from "@/lib/membership";
import { getStripe } from "@/lib/stripe";
import { createUserClient } from "@/lib/supabase/server";
import { tenantIdForRequest } from "@/lib/tenant-id";

/**
 * Stripe customer portal for members (F-097). POST /api/billing/portal from
 * the "Manage membership" form on the You page -> 303 to Stripe's portal,
 * where the reader can cancel, change their card and see invoices.
 * Cancelling is as easy as joining: one button here, one on Stripe's page.
 *
 * The customer id is read from the reader's own subscription rows under
 * RLS, so a reader can only ever open their own portal. Anything that goes
 * wrong sends them back to /you with a calm line; nothing is logged but the
 * error name.
 *
 * The portal's features (cancel at period end, card update, invoice
 * history) are set in the Stripe dashboard under Billing, Customer portal.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const origin = siteOrigin(request);
  const back = (notice?: string) =>
    NextResponse.redirect(`${origin}/you${notice ? `?membership=${notice}` : ""}#membership`, { status: 303 });

  const session = await getReaderSession();
  if (!session) return NextResponse.redirect(`${origin}/sign-in?next=/you`, { status: 303 });
  const tenantId = await tenantIdForRequest();
  if (!tenantId) return back("unavailable");

  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("status, plan, current_period_end, cancel_at_period_end, ended_at, stripe_customer_id, updated_at")
    .eq("user_id", session.userId)
    .eq("tenant_id", tenantId);
  if (error) return back("unavailable");
  const customer = portalCustomerId((data ?? []) as SubscriptionRow[]);
  if (!customer) return back();

  try {
    const portal = await getStripe().billingPortal.sessions.create({ customer, return_url: `${origin}/you#membership` });
    return NextResponse.redirect(portal.url, { status: 303 });
  } catch (err) {
    console.error("billing_portal_failed", { reason: err instanceof Error ? err.name : "unknown" });
    return back("unavailable");
  }
}

function siteOrigin(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? process.env.AKANA_HOST ?? "localhost:3000";
  const proto = request.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
