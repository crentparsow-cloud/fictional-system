import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getReaderSession } from "@/lib/auth";
import { BUNDLE_CURRENCY, bundleCheckoutParams } from "@/lib/bundle";
import { loadBundleOffer } from "@/lib/bundle-server";
import { checkoutConsentDecision, consentMetadata } from "@/lib/checkout-consent";
import { linkCheckoutConsent, recordCheckoutConsent } from "@/lib/checkout-consent-server";
import { NO_STORE } from "@/lib/enrolment";
import { CHECKOUT_BUSY_MESSAGE, hitSelf } from "@/lib/limits";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";
import { MARKETPLACE_TENANT_ID } from "@/lib/tenant";
import { tenantIdForRequest } from "@/lib/tenant-id";
import { checkoutTermsDecision } from "@/lib/terms";
import { acceptReaderTerms } from "@/lib/terms-server";

/**
 * Buy a Theme bundle (5.8). POST /api/checkout/bundle
 *   { theme, terms, consent }  ->  { url }
 *
 * The price and the titles are worked out here from the database, never
 * taken from the body: the same loader the Theme page uses. Stripe Checkout
 * in payment mode. A pending row goes into public.bundle_purchases with the
 * service role; the webhook (lib/conversion-webhook.ts) opens the titles
 * when the payment clears. Marketplace only.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({ theme: z.string().regex(/^[a-z0-9-]{1,60}$/), terms: z.string().max(40).optional(), consent: z.string().max(60).optional() }).strict();

function refuse(message: string, status = 409, code?: string) {
  return NextResponse.json(code ? { error: message, code } : { error: message }, { status, headers: NO_STORE });
}

export async function POST(request: NextRequest) {
  const session = await getReaderSession();
  if (!session) return refuse("Sign in to buy a bundle.", 401);
  const tenantId = await tenantIdForRequest();
  if (!tenantId) return refuse("Unknown storefront.", 404);
  if (tenantId !== MARKETPLACE_TENANT_ID) return refuse("Bundles are not available on this site.");

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
  const consent = checkoutConsentDecision("workbook", parsed.data.consent);
  if (!consent.ok) return NextResponse.json({ error: consent.error, code: consent.code }, { status: consent.status, headers: NO_STORE });

  const supabase = await createUserClient();
  const offer = await loadBundleOffer(supabase, parsed.data.theme, tenantId, session.userId);
  if (!offer) return refuse("This bundle is not on sale.");
  const { data: theme } = await supabase.from("themes").select("name").eq("id", parsed.data.theme).maybeSingle();
  const themeName = (theme as { name?: string } | null)?.name;
  if (!themeName) return refuse("This bundle is not on sale.");

  let stripe;
  try {
    stripe = getStripe();
  } catch {
    return refuse("Payments are not configured.", 503);
  }
  if (!(await hitSelf(supabase, "checkout_user"))) return NextResponse.json({ error: CHECKOUT_BUSY_MESSAGE, code: "rate_limited" }, { status: 429, headers: NO_STORE });
  if (!(await acceptReaderTerms("checkout", tenantId))) return refuse("Could not start checkout.", 500);
  const consentId = await recordCheckoutConsent({ kind: "workbook", version: consent.version, tenantId, workbookId: offer.workbookIds[0] });
  if (consentId === null) return refuse("Could not start checkout.", 500);

  const origin = siteOrigin(request);
  let checkout;
  try {
    checkout = await stripe.checkout.sessions.create(
      bundleCheckoutParams({
        themeId: parsed.data.theme,
        themeName,
        titleCount: offer.titleCount,
        bundleMinor: offer.bundleMinor,
        currency: BUNDLE_CURRENCY,
        userId: session.userId,
        tenantId,
        buyerEmail: session.email,
        consentMeta: consentMetadata(consentId, consent.version),
        successUrl: `${origin}/my-workbooks?bundle=paid`,
        cancelUrl: `${origin}/themes/${parsed.data.theme}`,
      }),
    );
  } catch (err) {
    const code = err instanceof Error && "code" in err ? String((err as { code?: unknown }).code ?? "") : "";
    console.error("bundle_checkout_failed", { code, type: err instanceof Error ? err.name : typeof err });
    return refuse("Checkout could not start just now. Please try again later.", 502);
  }

  if (!(await linkCheckoutConsent(consentId, checkout.id))) {
    await expireQuietly(stripe, checkout.id);
    return refuse("Could not start checkout.", 500);
  }
  const admin = createAdminClient();
  const { error } = await admin.rpc("bundle_create", {
    p_tenant: tenantId,
    p_user: session.userId,
    p_theme: parsed.data.theme,
    p_workbooks: offer.workbookIds,
    p_session: checkout.id,
    p_currency: BUNDLE_CURRENCY,
    p_amount_minor: offer.bundleMinor,
  });
  if (error) {
    await expireQuietly(stripe, checkout.id);
    console.error("bundle_checkout_row_failed", { session: checkout.id, code: error.code });
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
