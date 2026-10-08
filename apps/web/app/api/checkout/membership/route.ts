import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getReaderSession } from "@/lib/auth";
import { NO_STORE } from "@/lib/enrolment";
import { marketFor } from "@/lib/markets";
import {
  MEMBERSHIP_NOT_OPEN_MESSAGE,
  MEMBERSHIP_PLAN_POINT,
  hasLiveMembership,
  membershipCheckoutParams,
  membershipPriceId,
  portalCustomerId,
  type SubscriptionRow,
} from "@/lib/membership";
import { priceCurrencyFor } from "@/lib/pricing";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";
import { countFunnelEvent } from "@/lib/funnel";
import { tenantIdForRequest } from "@/lib/tenant-id";
import { checkoutTermsDecision } from "@/lib/terms";
import { acceptReaderTerms } from "@/lib/terms-server";
import { CHECKOUT_BUSY_MESSAGE, hitSelf } from "@/lib/limits";
import { checkoutConsentDecision, consentMetadata } from "@/lib/checkout-consent";
import { linkCheckoutConsent, recordCheckoutConsent } from "@/lib/checkout-consent-server";

/**
 * Membership checkout (F-097). POST /api/checkout/membership
 *   { plan: "monthly" | "yearly", workbook?: slug }  ->  { url }
 *
 * Stripe Checkout in subscription mode, next to the single workbook
 * checkout and kept in step with it: Stripe Tax, promotion codes and the
 * tax id field on, Akana as seller of record. The auto-renewal consent is
 * shown above the pay button. The price is a Stripe price id from
 * STRIPE_PRICE_MEMBERSHIP_MONTHLY or _YEARLY. While that is unset the route
 * answers 409 with "Membership is not open yet" and nothing else happens.
 *
 * The body carries the reader terms version shown by the pay button; a
 * missing or out of date one is refused (409), and the acceptance is
 * recorded before Stripe is called (F-122).
 *
 * The body also carries the version of the membership consent the reader
 * ticked: access starts now, and cancelling within 14 days gives a pro rata
 * refund (docs/legal/refund-policy.md, section 1). Missing or out of date is
 * refused (409, code consent_required or consent_changed). The consent is
 * recorded in public.checkout_consents (0019) before Stripe is called, its
 * id goes into the session and subscription metadata, and the row is linked
 * to the Checkout Session once it exists.
 *
 * Refuses (409) a reader who already has a live membership on this tenant.
 * 401 without a session, 404 for an unknown tenant.
 *
 * A pending row goes into public.purchases (kind membership) with the
 * service role, as the single checkout does, so checkout.session.completed
 * grants access at once through the existing path. Every later change comes
 * from customer.subscription.* events (migration 0009).
 *
 * A returning member keeps their Stripe customer, so they have one portal
 * and one invoice history.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z
  .object({
    plan: z.enum(["monthly", "yearly"]),
    workbook: z
      .string()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      .optional(),
    // The reader terms version shown by the pay button (F-122).
    terms: z.string().max(40).optional(),
    // The membership consent version the reader ticked (0019).
    consent: z.string().max(60).optional(),
  })
  .strict();

function refuse(message: string, status = 409) {
  return NextResponse.json({ error: message }, { status, headers: NO_STORE });
}

export async function POST(request: NextRequest) {
  const session = await getReaderSession();
  if (!session) return refuse("Sign in to join the membership.", 401);

  const tenantId = await tenantIdForRequest();
  if (!tenantId) return refuse("Unknown storefront.", 404);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return refuse("Invalid request.", 400);
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return refuse("Invalid request.", 400);
  const { plan, workbook } = parsed.data;
  const terms = checkoutTermsDecision(parsed.data.terms);
  if (!terms.ok) return NextResponse.json({ error: terms.error, code: terms.code }, { status: terms.status, headers: NO_STORE });
  const consent = checkoutConsentDecision("membership", parsed.data.consent);
  if (!consent.ok) return NextResponse.json({ error: consent.error, code: consent.code }, { status: consent.status, headers: NO_STORE });

  // PLACEHOLDER until Crent sets the membership prices (C4, D1 to D4).
  const priceId = membershipPriceId(plan);
  if (!priceId) {
    console.warn("membership_price_missing", { plan });
    return refuse(MEMBERSHIP_NOT_OPEN_MESSAGE);
  }

  const supabase = await createUserClient();
  const { data: subs, error: subErr } = await supabase
    .from("subscriptions")
    .select("status, plan, current_period_end, cancel_at_period_end, ended_at, stripe_customer_id, updated_at")
    .eq("user_id", session.userId)
    .eq("tenant_id", tenantId);
  if (subErr) return refuse("Could not start checkout.", 500);
  const rows = (subs ?? []) as SubscriptionRow[];
  if (hasLiveMembership(rows)) return refuse("You are already a member. You can manage your membership in your account.");

  const { data: profile } = await supabase.from("profiles").select("country").eq("user_id", session.userId).maybeSingle();
  const market = marketFor((profile?.country as string | null | undefined) ?? null);

  let stripe;
  try {
    stripe = getStripe();
  } catch {
    return refuse(MEMBERSHIP_NOT_OPEN_MESSAGE, 503);
  }

  // F-143: at most 10 Checkout Sessions an hour per reader (0027), counted before anything is recorded.
  if (!(await hitSelf(supabase, "checkout_user"))) {
    return NextResponse.json({ error: CHECKOUT_BUSY_MESSAGE, code: "rate_limited" }, { status: 429, headers: NO_STORE });
  }
  // F-122: the acceptance is recorded before payment starts. No record, no checkout.
  if (!(await acceptReaderTerms("checkout", tenantId))) return refuse("Could not start checkout.", 500);
  // The membership consent, recorded the same way before payment starts.
  const consentId = await recordCheckoutConsent({ kind: "membership", version: consent.version, tenantId, plan: MEMBERSHIP_PLAN_POINT[plan] });
  if (consentId === null) return refuse("Could not start checkout.", 500);

  const origin = siteOrigin(request);
  const successUrl = workbook ? `${origin}/read/${workbook}?member=1&session_id={CHECKOUT_SESSION_ID}` : `${origin}/you?membership=welcome#membership`;
  const cancelUrl = workbook ? `${origin}/read/${workbook}` : `${origin}/you#membership`;

  let checkout;
  try {
    const params = membershipCheckoutParams({
      plan,
      priceId,
      userId: session.userId,
      tenantId,
      email: session.email,
      customerId: portalCustomerId(rows),
      successUrl,
      cancelUrl,
    });
    const consentMeta = consentMetadata(consentId, consent.version);
    params.metadata = { ...params.metadata, ...consentMeta };
    params.subscription_data = { ...params.subscription_data, metadata: { ...params.subscription_data?.metadata, ...consentMeta } };
    checkout = await stripe.checkout.sessions.create(params);
  } catch (err) {
    console.error("membership_checkout_failed", { reason: err instanceof Error ? err.name : "unknown" });
    return refuse("Checkout could not start just now. Please try again later.", 502);
  }

  // Tie the consent to this session. If that fails, do not leave a payable session behind.
  if (!(await linkCheckoutConsent(consentId, checkout.id))) {
    await expireQuietly(stripe, checkout.id);
    return refuse("Could not start checkout.", 500);
  }

  const admin = createAdminClient();
  const { error: insErr } = await admin.from("purchases").insert({
    user_id: session.userId,
    tenant_id: tenantId,
    workbook_id: null,
    kind: "membership",
    price_point_id: MEMBERSHIP_PLAN_POINT[plan],
    stripe_checkout_session_id: checkout.id,
    // The real currency and amount are copied from the session when it completes.
    currency: priceCurrencyFor(market),
    amount_minor: 0,
    status: "pending",
  });
  if (insErr) {
    await expireQuietly(stripe, checkout.id);
    console.error("membership checkout: purchase insert failed", { session: checkout.id, code: insErr.code });
    return refuse("Could not start checkout.", 500);
  }

  if (!checkout.url) return refuse("Could not start checkout.", 500);
  // F-141: a daily count, ids only, unless the visitor has opted out.
  await countFunnelEvent(supabase, "checkout_started", { tenantId, workbookId: null, headers: request.headers, cookies: request.cookies });
  return NextResponse.json({ url: checkout.url }, { headers: NO_STORE });
}

async function expireQuietly(stripe: ReturnType<typeof getStripe>, id: string): Promise<void> {
  try {
    await stripe.checkout.sessions.expire(id);
  } catch {
    // the session expires on its own within 24 hours
  }
}

/** The public origin for the redirect URLs, from the proxy's headers. */
function siteOrigin(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? process.env.AKANA_HOST ?? "localhost:3000";
  const proto = request.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
