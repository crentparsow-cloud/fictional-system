import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getReaderSession } from "@/lib/auth";
import { NO_STORE } from "@/lib/enrolment";
import { marketFor } from "@/lib/markets";
import { priceFor, pricePointFromRow } from "@/lib/pricing";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";
import { tenantIdForRequest } from "@/lib/tenant-id";

/**
 * Single workbook checkout (F-096). POST /api/checkout { workbook: slug }
 * -> { url } for Stripe's hosted Checkout page.
 *
 * Refuses (409, plain message) a demo title (F-114), a workbook with no
 * price point or a placeholder price (D1 to D4 open), and a title the reader
 * already holds. 401 without a session, 404 for an unknown slug or tenant.
 *
 * Stripe never sees a title. The line item is "Akana workbook" with the AK
 * code as its description, so statements and receipts carry the code only
 * (F-092, F-098). Stripe Tax, promotion codes and the tax id field are on.
 *
 * Why the admin client: readers have no insert grant on public.purchases
 * (0004). The pending row is written here with the service role after the
 * session and tenant checks above have passed under RLS, so the webhook can
 * find the purchase by Checkout Session id and grant the entitlement. The
 * workbook and price lookups stay on the reader's own client so RLS decides
 * what they can buy.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({ workbook: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/) }).strict();

interface WorkbookRow {
  id: string;
  code: string;
  slug: string;
  tenant_id: string;
  is_demo: boolean;
  status: string;
  price_point_id: string | null;
  in_membership: boolean;
}

interface PricePointRow {
  id: string;
  kind: string;
  amounts: unknown;
  stripe_price_id: string | null;
  active: boolean;
}

function refuse(message: string, status = 409) {
  return NextResponse.json({ error: message }, { status, headers: NO_STORE });
}

export async function POST(request: NextRequest) {
  const session = await getReaderSession();
  if (!session) return refuse("Sign in to buy a workbook.", 401);

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

  const supabase = await createUserClient();
  const { data: wb, error: wbErr } = await supabase
    .from("workbooks")
    .select("id, code, slug, tenant_id, is_demo, status, price_point_id, in_membership")
    .eq("slug", parsed.data.workbook)
    .maybeSingle();
  if (wbErr) return refuse("Could not load the workbook.", 500);
  if (!wb) return refuse("Workbook not found.", 404);
  const workbook = wb as WorkbookRow;

  if (workbook.is_demo) return refuse("Demo workbooks cannot be bought.");
  if (workbook.status !== "live") return refuse("This workbook is not on sale.");
  // The entitlement check reads the workbook's own tenant (0004), so a
  // purchase on another storefront would not open the content. White-label
  // listings arrive in week 2 with their own rule.
  if (workbook.tenant_id !== tenantId) return refuse("This workbook is not sold on this storefront.");
  if (!workbook.price_point_id) return refuse("Price to be confirmed.");

  const { data: pp, error: ppErr } = await supabase
    .from("price_points")
    .select("id, kind, amounts, stripe_price_id, active")
    .eq("id", workbook.price_point_id)
    .maybeSingle();
  if (ppErr) return refuse("Could not load the price.", 500);
  const point = pp ? pricePointFromRow(pp as PricePointRow) : null;
  if (!point || !point.active) return refuse("Price to be confirmed.");

  const { data: profile } = await supabase.from("profiles").select("country").eq("user_id", session.userId).maybeSingle();
  const market = marketFor((profile?.country as string | null | undefined) ?? null);
  const price = priceFor({ pricePointId: point.id, isDemo: false }, market, { [point.id]: point });
  if (!price) return refuse("Price to be confirmed.");

  const { data: owned } = await supabase
    .from("entitlements")
    .select("id, source, ends_at")
    .eq("user_id", session.userId)
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .or(`workbook_id.eq.${workbook.id},workbook_id.is.null`);
  // A membership row covers only titles in the membership (migration 0009),
  // so a member may still buy a title outside it.
  const now = Date.now();
  const covers = ((owned ?? []) as { source: string; ends_at: string | null }[]).some(
    (e) => (!e.ends_at || Date.parse(e.ends_at) > now) && (e.source !== "membership" || workbook.in_membership),
  );
  if (covers) return refuse("You already have this workbook.");

  const origin = siteOrigin(request);
  let stripe;
  try {
    stripe = getStripe();
  } catch {
    return refuse("Payments are not configured.", 503);
  }

  const checkout = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: price.currency.toLowerCase(),
          unit_amount: price.amountMinor,
          tax_behavior: "inclusive",
          product_data: { name: "Akana workbook", description: workbook.code },
        },
      },
    ],
    automatic_tax: { enabled: true },
    allow_promotion_codes: true,
    tax_id_collection: { enabled: true },
    customer_email: session.email ?? undefined,
    client_reference_id: session.userId,
    metadata: { user_id: session.userId, tenant_id: tenantId, workbook_id: workbook.id, code: workbook.code },
    success_url: `${origin}/read/${workbook.slug}?paid=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/w/${workbook.slug}`,
  });

  const admin = createAdminClient();
  const { error: insErr } = await admin.from("purchases").insert({
    user_id: session.userId,
    tenant_id: tenantId,
    workbook_id: workbook.id,
    kind: "workbook",
    price_point_id: point.id,
    stripe_checkout_session_id: checkout.id,
    currency: price.currency,
    amount_minor: price.amountMinor,
    status: "pending",
  });
  if (insErr) {
    // Do not leave a payable session with no purchase row behind it.
    try {
      await stripe.checkout.sessions.expire(checkout.id);
    } catch {
      // the session expires on its own within 24 hours
    }
    console.error("checkout: purchase insert failed", { session: checkout.id, code: insErr.code });
    return refuse("Could not start checkout.", 500);
  }

  if (!checkout.url) return refuse("Could not start checkout.", 500);
  return NextResponse.json({ url: checkout.url }, { headers: NO_STORE });
}

/** The public origin for the redirect URLs, from the proxy's headers. */
function siteOrigin(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? process.env.AKANA_HOST ?? "localhost:3000";
  const proto = request.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
