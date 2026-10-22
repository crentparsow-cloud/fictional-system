import "server-only";
import type Stripe from "stripe";
import { orgPriceId, type BillingNotice, type OrgPlanId } from "@/lib/org-billing";
import { testStripe } from "@/lib/org-stripe";
import {
  CHURCH_BAND_IDS,
  GROUP_LICENCE_PLAN,
  parsePlanPrices,
  priceOf,
  SMALL_ORG_PLAN,
  stripeLookupKey,
  stripeProductName,
  type ChurchInput,
  type GroupLicenceInput,
  type PlanPrice,
  type PlanPriceId,
  type PlanPriceRow,
  type SmallOrgInput,
} from "@/lib/org-plans";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Server side of the Phase B organisation plans (6.6, 9.1, 9.5, 13.14, 14.37).
 * Prices come from public.org_plan_prices. Stripe gets its price from a
 * lookup key made of the plan, amount and VAT treatment: the price is found
 * if it exists and made if not, so changing a row in the table is all it
 * takes. An env price id (STRIPE_PRICE_ORG_*) still wins when it is set,
 * for a price Crent made by hand. Test mode only, as the rest of
 * organisation billing: every call refuses without a test key.
 */

/** Active prices, as the public sees them. Empty when the table cannot be read. */
export async function loadPlanPrices(): Promise<PlanPrice[]> {
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase
      .from("org_plan_prices")
      .select("plan_id, label, kind, currency, amount_minor, tax_behavior, min_seats, max_seats, attendance_min, attendance_max, sort, active, note")
      .eq("active", true)
      .order("sort", { ascending: true });
    if (error) throw new Error(error.message);
    return parsePlanPrices((data ?? []) as PlanPriceRow[]);
  } catch (err) {
    console.error("org_plan_prices_read_failed", err instanceof Error ? err.message : "unknown");
    return [];
  }
}

/** Plans that have a price in the table, for the staff and billing screens ("no price" otherwise). */
export async function tablePricedPlans(): Promise<ReadonlySet<string>> {
  return new Set((await loadPlanPrices()).map((p) => p.id));
}

/** The Stripe price for a plan: an env override, else the lookup-key price (made if it does not exist yet). */
export async function resolveStripePrice(stripe: Stripe, plan: PlanPriceId | OrgPlanId, prices: readonly PlanPrice[]): Promise<string | null> {
  if (plan !== GROUP_LICENCE_PLAN) {
    const env = orgPriceId(plan as OrgPlanId);
    if (env) return env;
  }
  const p = priceOf(prices, plan as PlanPriceId);
  if (!p) return null;
  const key = stripeLookupKey(p);
  const found = await stripe.prices.list({ lookup_keys: [key], active: true, limit: 1 });
  if (found.data[0]) return found.data[0].id;
  const made = await stripe.prices.create(
    {
      currency: p.currency.toLowerCase(),
      unit_amount: p.amountMinor,
      tax_behavior: p.vatIncluded ? "inclusive" : "exclusive",
      ...(p.kind === "pack_once" ? {} : { recurring: { interval: "year" as const } }),
      product_data: { name: stripeProductName(p) },
      lookup_key: key,
      metadata: { akana_plan: p.id },
    },
    { idempotencyKey: `org_price:${key}` },
  );
  return made.id;
}

type Started = { url: string } | BillingNotice;

async function openFor(plan: PlanPriceId): Promise<{ stripe: Stripe; price: string; row: PlanPrice } | BillingNotice> {
  const supabase = await createUserClient();
  const { data: open } = await supabase.rpc("org_self_serve_open");
  if (open !== true) return "state";
  const prices = await loadPlanPrices();
  const row = priceOf(prices, plan);
  if (!row) return "not_priced";
  const stripe = testStripe();
  if (!stripe) return "stripe_off";
  try {
    const price = await resolveStripePrice(stripe, plan, prices);
    return price ? { stripe, price, row } : "not_priced";
  } catch (e) {
    console.error("org_plan_price_failed", { plan, reason: e instanceof Error ? e.name : "unknown" });
    return "stripe_failed";
  }
}

interface Who {
  userId: string;
  email: string | null;
  origin: string;
}

/** Small organisation: one annual subscription, quantity = seats. */
export async function startSmallOrgCheckout(a: Who & { input: SmallOrgInput }): Promise<Started> {
  const ready = await openFor(SMALL_ORG_PLAN);
  if (typeof ready === "string") return ready;
  const meta = {
    akana_kind: "org_signup",
    user_id: a.userId,
    plan: SMALL_ORG_PLAN,
    org_kind: a.input.orgKind,
    org_name: a.input.name,
    quantity: String(a.input.seats),
    auto_seat: a.input.autoSeat ? "yes" : "no",
  };
  return checkout(ready.stripe, {
    mode: "subscription",
    line_items: [{ price: ready.price, quantity: a.input.seats }],
    customer_email: a.email ?? undefined,
    automatic_tax: { enabled: true },
    tax_id_collection: { enabled: true },
    billing_address_collection: "required",
    metadata: meta,
    subscription_data: { metadata: meta },
    success_url: `${a.origin}/org/start?done=1`,
    cancel_url: `${a.origin}/org/start`,
  });
}

/** Church: one annual subscription of quantity 1 at the band the organiser chose. */
export async function startChurchCheckout(a: Who & { input: ChurchInput }): Promise<Started> {
  if (!(CHURCH_BAND_IDS as readonly string[]).includes(a.input.band)) return "invalid";
  const ready = await openFor(a.input.band);
  if (typeof ready === "string") return ready;
  const meta = {
    akana_kind: "org_signup",
    user_id: a.userId,
    plan: a.input.band,
    org_kind: "church",
    org_name: a.input.name,
    quantity: "1",
    auto_seat: a.input.autoSeat ? "yes" : "no",
  };
  return checkout(ready.stripe, {
    mode: "subscription",
    line_items: [{ price: ready.price, quantity: 1 }],
    customer_email: a.email ?? undefined,
    automatic_tax: { enabled: true },
    tax_id_collection: { enabled: true },
    billing_address_collection: "required",
    metadata: meta,
    subscription_data: { metadata: meta },
    success_url: `${a.origin}/org/start?done=1`,
    cancel_url: `${a.origin}/org/start`,
  });
}

/** Six-seat group licence: one payment, no subscription. */
export async function startGroupLicenceCheckout(a: Who & { input: GroupLicenceInput }): Promise<Started> {
  const ready = await openFor(GROUP_LICENCE_PLAN);
  if (typeof ready === "string") return ready;
  const meta = {
    akana_kind: "org_pack",
    user_id: a.userId,
    plan: GROUP_LICENCE_PLAN,
    workbook_id: a.input.workbookId,
    org_name: a.input.name,
  };
  return checkout(ready.stripe, {
    mode: "payment",
    line_items: [{ price: ready.price, quantity: 1 }],
    customer_email: a.email ?? undefined,
    automatic_tax: { enabled: true },
    billing_address_collection: "required",
    metadata: meta,
    payment_intent_data: { metadata: meta },
    success_url: `${a.origin}/org/start?done=group`,
    cancel_url: `${a.origin}/org/start`,
  });
}

async function checkout(stripe: Stripe, params: Stripe.Checkout.SessionCreateParams): Promise<Started> {
  try {
    const session = await stripe.checkout.sessions.create(params);
    return session.url ? { url: session.url } : "stripe_failed";
  } catch (e) {
    console.error("org_plan_checkout_failed", { reason: e instanceof Error ? e.name : "unknown" });
    return "stripe_failed";
  }
}

export interface PackTitle {
  id: string;
  title: string;
}

/** Titles a group licence can be for: live, not a demo, not higher tier, on the Akana storefront. */
export async function loadPackTitles(): Promise<PackTitle[]> {
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase
      .from("workbooks")
      .select("id, title")
      .eq("tenant_id", "00000000-0000-0000-0000-00000000000a")
      .eq("status", "live")
      .eq("is_demo", false)
      .neq("safety_tier", "higher")
      .order("title", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    return ((data ?? []) as PackTitle[]).filter((t) => typeof t.id === "string" && typeof t.title === "string");
  } catch (err) {
    console.error("org_pack_titles_failed", err instanceof Error ? err.message : "unknown");
    return [];
  }
}
