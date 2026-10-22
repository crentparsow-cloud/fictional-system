import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getReaderSession } from "@/lib/auth";
import { NO_STORE } from "@/lib/enrolment";
import { marketFor } from "@/lib/markets";
import {
  MEMBERSHIP_NOT_OPEN_MESSAGE,
  MEMBERSHIP_PLAN_POINT,
  hasLiveMembership,
  type MembershipPlan,
  membershipCheckoutParams,
  membershipPriceId,
  portalCustomerId,
  type SubscriptionRow,
} from "@/lib/membership";
import { PRICE_LADDER, checkoutCurrencyFor, isPlaceholder, pricePointFromRow, type PricePoint } from "@/lib/pricing";
import { trialCheckoutNotice, trialEligible } from "@/lib/membership-trial";
import { loadTrialConfig } from "@/lib/membership-trial-server";
import { formatMinor } from "@/lib/membership-email";
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
import { PROMO_MESSAGES } from "@/lib/promo-code";
import { lookupPromoCode } from "@/lib/promo-code-server";
import { friendBenefit, referralConfigFrom, referralCouponId } from "@/lib/referral";
import { discountedMinor, studentCouponId, studentDiscountApplies, studentPercentFrom, studentPlanAllowed, studentStatus } from "@/lib/student";

/**
 * Membership checkout (F-097). POST /api/checkout/membership
 *   { plan: "monthly" | "yearly" | "two_monthly" | "two_yearly", workbook?: slug }  ->  { url }
 *
 * Stripe Checkout in subscription mode, next to the single workbook
 * checkout and kept in step with it: Stripe Tax, promotion codes and the
 * tax id field on, Akana as seller of record. The auto-renewal consent is
 * shown above the pay button. The price is a Stripe price id from
 * STRIPE_PRICE_MEMBERSHIP_MONTHLY, _YEARLY, _TWO_MONTHLY or _TWO_YEARLY. While the plan's is unset the route
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
 *
 * Student price (14.22): with student true, and STRIPE_COUPON_STUDENT set, the
 * Stripe coupon is pinned to the session for a reader whose academic email is
 * confirmed and not past its year (public.student_verifications, 0054). One
 * person plans only, and not together with a promotion code. While the
 * coupon id is blank the route refuses a student request.
 *
 * Trial (13.5): a reader with no earlier subscription gets the trial for the
 * plan they chose (app_config, 14 days monthly and 21 annual by default),
 * card required. Stripe's pay button states the first payment date and the
 * reminder date. The reminder goes out on customer.subscription.trial_will_end
 * (lib/stripe-webhook.ts). Cooling-off runs from the first payment, not from
 * the day the trial began (lib/membership-refund.ts coolingOffOpensAt).
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z
  .object({
    plan: z.enum(["monthly", "yearly", "two_monthly", "two_yearly"]),
    workbook: z
      .string()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      .optional(),
    // The reader terms version shown by the pay button (F-122).
    terms: z.string().max(40).optional(),
    // The membership consent version the reader ticked (0019).
    consent: z.string().max(60).optional(),
    // A promotion code from the /code page (item 5.9), checked again against Stripe.
    code: z.string().max(40).optional(),
    // The student price (14.22): the coupon from STRIPE_COUPON_STUDENT, for a reader whose academic email is confirmed.
    student: z.boolean().optional(),
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

  // The plan opens when its Stripe price id is set (STRIPE_PRICE_MEMBERSHIP_*).
  const priceId = membershipPriceId(plan);
  if (!priceId) {
    console.warn("membership_price_missing", { plan });
    return refuse(MEMBERSHIP_NOT_OPEN_MESSAGE);
  }

  // 14.22: the student coupon, only for a confirmed and current verification.
  let studentCoupon: string | null = null;
  let studentPercent = 0;
  const supabase = await createUserClient();
  if (parsed.data.student) {
    studentCoupon = studentCouponId();
    if (!studentCoupon) return refuse("The student price is not open yet.");
    if (!studentPlanAllowed(plan)) return refuse("The student price is for the single-person plans.");
    if (parsed.data.code) return refuse("The student price cannot be used together with a code.");
    const [{ data: sv }, { data: cfg }] = await Promise.all([
      supabase.from("student_verifications").select("verified_at, expires_at").eq("user_id", session.userId).maybeSingle(),
      supabase.from("app_config").select("key, value").eq("key", "student_discount_percent"),
    ]);
    if (!studentDiscountApplies(studentStatus(sv as { verified_at: string | null; expires_at: string | null } | null, new Date()))) {
      return NextResponse.json({ error: "Confirm your student email first.", code: "student_required" }, { status: 409, headers: NO_STORE });
    }
    studentPercent = studentPercentFrom((cfg ?? []) as { key: string; value: unknown }[]);
  }
  const { data: subs, error: subErr } = await supabase
    .from("subscriptions")
    .select("status, plan, current_period_end, cancel_at_period_end, ended_at, stripe_customer_id, updated_at")
    .eq("user_id", session.userId)
    .eq("tenant_id", tenantId);
  if (subErr) return refuse("Could not start checkout.", 500);
  const rows = (subs ?? []) as SubscriptionRow[];
  if (hasLiveMembership(rows)) return refuse("You are already a member. You can manage your membership in your account.");
  // A person who holds the second place on someone else's membership has access already.
  const { data: seats } = await supabase.from("membership_seats").select("id").eq("tenant_id", tenantId).eq("status", "active");
  if (seats && seats.length > 0) {
    return refuse("You already have access through a shared membership. Leave it first if you would rather have your own.");
  }

  const { data: profile } = await supabase.from("profiles").select("country").eq("user_id", session.userId).maybeSingle();
  const market = marketFor((profile?.country as string | null | undefined) ?? null);

  // Item 5.9: the code the page showed, looked up again and pinned to the session as its discount.
  let promotionCodeId: string | null = null;
  if (parsed.data.code) {
    const promo = await lookupPromoCode(parsed.data.code, `checkout:${session.userId}`);
    if (!promo.ok) {
      return NextResponse.json({ error: PROMO_MESSAGES[promo.reason], code: "promo_invalid" }, { status: 409, headers: NO_STORE });
    }
    promotionCodeId = promo.offer.id;
  }

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

  // 13.5: a first-time member gets the trial for the plan, card required. The
  // pay button states the first payment date and the reminder date. The trial
  // never depends on a price formatting: if the renewal price cannot be
  // formatted that is logged and the notice says so in words.
  // The two-person plan has no trial: the trial settings cover the monthly and annual plans only.
  const trialPlan = plan === "two_monthly" || plan === "two_yearly" ? null : plan;
  const baseTrialDays = trialPlan && trialEligible(rows.length) ? (await loadTrialConfig())[trialPlan] : 0;
  // 6.3: a friend who used a reader's invitation gets extra trial days, or an amount off the first payment of a plan with no trial.
  const pendingReferral = rows.length === 0 ? await loadPendingReferral(session.userId) : null;
  // One currency rule for the amounts, the notice and the pending row: the market's currency where the point has a figure, else GBP.
  const point = await loadPricePoint(supabase, plan);
  const currency = checkoutCurrencyFor(point, market);
  const couponId = referralCouponId();
  const benefit = pendingReferral
    ? friendBenefit({
        plan,
        baseTrialDays,
        trialEligible: trialEligible(rows.length),
        currency,
        config: pendingReferral.config,
        couponId,
        promoCodeUsed: promotionCodeId !== null,
      })
    : null;
  const trialDays = benefit?.kind === "trial_days" ? benefit.totalDays : baseTrialDays;
  const referralNotice =
    benefit?.kind === "trial_days"
      ? `Your trial includes ${benefit.extraDays} extra days from a friend's invitation.`
      : benefit?.kind === "first_payment_off"
        ? `Your first payment is ${formatMinor(benefit.minor, benefit.currency) ?? "an amount"} lower, from a friend's invitation.`
        : null;
  
  const renewalPrice = formatRenewalPrice(point, currency, studentCoupon ? studentPercent : 0);
  if (renewalPrice === null) console.warn("membership_renewal_price_unformatted", { code: "no_renewal_price", plan });
  const yearlyTotal = plan === "yearly" || plan === "two_yearly" ? renewalPrice : null;
  const trialNotice = trialPlan && trialDays > 0 ? trialCheckoutNotice(trialPlan, trialDays, renewalPrice, new Date()) : null;
  const trial = trialNotice ? { days: trialDays, notice: trialNotice } : null;

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
      promotionCodeId,
      trial,
      yearlyTotal,
      couponId: studentCoupon ?? (benefit?.kind === "first_payment_off" ? couponId : null),
      extraNotice: referralNotice,
    });
    const consentMeta = consentMetadata(consentId, consent.version);
    const referralMeta: Record<string, string> = pendingReferral && benefit ? { referral_id: pendingReferral.id } : {};
    params.metadata = { ...params.metadata, ...consentMeta, ...referralMeta };
    params.subscription_data = { ...params.subscription_data, metadata: { ...params.subscription_data?.metadata, ...consentMeta, ...referralMeta } };
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
    currency,
    amount_minor: 0,
    status: "pending",
  });
  if (insErr) {
    await expireQuietly(stripe, checkout.id);
    console.error("membership checkout: purchase insert failed", { session: checkout.id, code: insErr.code });
    return refuse("Could not start checkout.", 500);
  }

  // 6.3: remember what the friend was offered, against this session. Best effort: the reward does not depend on it.
  if (pendingReferral && benefit) {
    const value = benefit.kind === "trial_days" ? benefit.extraDays : benefit.minor;
    const { error: offerErr } = await admin.rpc("referral_offer_recorded", { p_referral: pendingReferral.id, p_benefit: benefit.kind, p_value: value, p_session: checkout.id });
    if (offerErr) console.warn("referral_offer_not_recorded", { code: offerErr.code });
  }

  if (!checkout.url) return refuse("Could not start checkout.", 500);
  // F-141: a daily count, ids only, unless the visitor has opted out.
  await countFunnelEvent(supabase, "checkout_started", { tenantId, workbookId: null, headers: request.headers, cookies: request.cookies, userId: session.userId });
  return NextResponse.json({ url: checkout.url }, { headers: NO_STORE });
}

/** The friend's waiting invitation and the referral settings, or null. Never blocks checkout. */
async function loadPendingReferral(userId: string): Promise<{ id: string; config: ReturnType<typeof referralConfigFrom> } | null> {
  try {
    const { data, error } = await createAdminClient().rpc("referral_for_checkout", { p_user: userId });
    if (error) return null;
    const row = ((data ?? []) as { referral_id: string; config: unknown }[])[0];
    return row ? { id: row.referral_id, config: referralConfigFrom(row.config) } : null;
  } catch {
    return null;
  }
}

/** The plan's price point from the row, else the ladder mirror when the row is missing or holds no figure. */
async function loadPricePoint(supabase: Awaited<ReturnType<typeof createUserClient>>, plan: MembershipPlan): Promise<PricePoint> {
  const id = MEMBERSHIP_PLAN_POINT[plan];
  const { data } = await supabase.from("price_points").select("id, kind, amounts, stripe_price_id, active").eq("id", id).maybeSingle();
  const fromRow = data ? pricePointFromRow(data as { id: string; kind: string; amounts: unknown; stripe_price_id: string | null; active: boolean }) : null;
  return fromRow && !isPlaceholder(fromRow) ? fromRow : PRICE_LADDER[id];
}

/** The renewal price for the notice, "£7.99", in the checkout currency. Null when it cannot be formatted. */
function formatRenewalPrice(point: PricePoint, currency: string, discountPercent = 0): string | null {
  const minor = (point.amounts as Record<string, number | undefined>)[currency];
  return typeof minor === "number" && minor > 0 ? (formatMinor(discountPercent > 0 ? discountedMinor(minor, discountPercent) : minor, currency) ?? null) : null;
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
