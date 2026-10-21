import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getReaderSession } from "@/lib/auth";
import { NO_STORE } from "@/lib/enrolment";
import { GIFT_PROBLEM_WORDS, checkGiftInput, giftCheckoutParams, giftPriceMinor, newClaimToken } from "@/lib/gift";
import { GIFT_CURRENCY, loadGiftConfig } from "@/lib/gift-server";
import { CHECKOUT_BUSY_MESSAGE, hitSelf } from "@/lib/limits";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";
import { MARKETPLACE_TENANT_ID } from "@/lib/tenant";
import { tenantIdForRequest } from "@/lib/tenant-id";
import { checkoutTermsDecision } from "@/lib/terms";
import { acceptReaderTerms } from "@/lib/terms-server";

/**
 * Gift a membership (5.6, 5.7). POST /api/checkout/gift
 *   { months, recipientEmail, recipientName?, senderName?, message?, terms }  ->  { url }
 *
 * Stripe Checkout in payment mode: the buyer pays once and nothing renews.
 * The price is worked out here from the membership price points
 * (lib/gift.ts), never taken from the body. A pending row goes into
 * public.gift_memberships with the service role once the session exists; the
 * webhook (lib/conversion-webhook.ts) marks it paid and emails the recipient
 * their claim link. Stripe is told the length and nothing about the
 * recipient or the message.
 *
 * Marketplace only. 401 without a session, 409 for a form that does not
 * check out (the message says what), 503 while Stripe is not set up.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z
  .object({
    months: z.union([z.number(), z.string()]),
    recipientEmail: z.string().max(320),
    recipientName: z.string().max(200).optional(),
    senderName: z.string().max(200).optional(),
    message: z.string().max(2000).optional(),
    terms: z.string().max(40).optional(),
  })
  .strict();

function refuse(message: string, status = 409, code?: string) {
  return NextResponse.json(code ? { error: message, code } : { error: message }, { status, headers: NO_STORE });
}

export async function POST(request: NextRequest) {
  const session = await getReaderSession();
  if (!session) return refuse("Sign in to give a membership.", 401);

  const tenantId = await tenantIdForRequest();
  if (!tenantId) return refuse("Unknown storefront.", 404);
  if (tenantId !== MARKETPLACE_TENANT_ID) return refuse("Gifts are not available on this site.");

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return refuse("Invalid request.", 400);
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return refuse("Invalid request.", 400);
  const terms = checkoutTermsDecision(parsed.data.terms);
  if (!terms.ok) return NextResponse.json({ error: terms.error, code: terms.code }, { status: terms.status, headers: NO_STORE });

  const supabase = await createUserClient();
  const config = await loadGiftConfig(supabase);
  const checked = checkGiftInput(parsed.data, { allowedMonths: config.months, messageMax: config.messageMax, buyerEmail: session.email });
  if (!checked.ok) return refuse(GIFT_PROBLEM_WORDS[checked.problem], 409, checked.problem);
  const input = checked.value;

  const priceMinor = giftPriceMinor(input.months, config.monthlyMinor, config.yearlyMinor);
  if (priceMinor === null) return refuse("Gifts are not open yet. Please try again soon.");

  let stripe;
  try {
    stripe = getStripe();
  } catch {
    return refuse("Gifts are not open yet. Please try again soon.", 503);
  }

  // At most 10 Checkout Sessions an hour per reader (0027), the same limit as the other checkouts.
  if (!(await hitSelf(supabase, "checkout_user"))) return NextResponse.json({ error: CHECKOUT_BUSY_MESSAGE, code: "rate_limited" }, { status: 429, headers: NO_STORE });
  // The acceptance is recorded before payment starts. No record, no checkout.
  if (!(await acceptReaderTerms("checkout", tenantId))) return refuse("Could not start checkout.", 500);

  const origin = siteOrigin(request);
  let checkout;
  try {
    checkout = await stripe.checkout.sessions.create(
      giftCheckoutParams({
        months: input.months,
        priceMinor,
        currency: GIFT_CURRENCY,
        userId: session.userId,
        tenantId,
        buyerEmail: session.email,
        successUrl: `${origin}/gift?thanks=1`,
        cancelUrl: `${origin}/gift`,
      }),
    );
  } catch (err) {
    const code = err instanceof Error && "code" in err ? String((err as { code?: unknown }).code ?? "") : "";
    console.error("gift_checkout_failed", { code, type: err instanceof Error ? err.name : typeof err });
    return refuse("Checkout could not start just now. Please try again later.", 502);
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("gift_create", {
    p_tenant: tenantId,
    p_buyer: session.userId,
    p_session: checkout.id,
    p_token: newClaimToken(),
    p_months: input.months,
    p_recipient_email: input.recipientEmail,
    p_recipient_name: input.recipientName || null,
    p_sender_name: input.senderName || null,
    p_message: input.message || null,
    p_currency: GIFT_CURRENCY,
    p_amount_minor: priceMinor,
  });
  if (error) {
    await expireQuietly(stripe, checkout.id);
    console.error("gift_checkout_row_failed", { session: checkout.id, code: error.code });
    return refuse("Could not start checkout.", 500);
  }
  if (!checkout.url) return refuse("Could not start checkout.", 500);
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
