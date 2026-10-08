import "server-only";
import type Stripe from "stripe";
import { isTestKey } from "@/lib/money/reconcile";
import { billingErrorNotice, ORG_PLANS, orgPriceId, type BillingNotice, type OrgPlanId, type SignupInput } from "@/lib/org-billing";
import { getStripe } from "@/lib/stripe";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Server side of organisation billing (F-220, F-226, F-228). STRIPE TEST
 * MODE ONLY: every call here refuses unless STRIPE_SECRET_KEY is a test
 * key. Each action first asks a 0030 function, through the signed-in
 * person's own client, whether they may; only then does it call Stripe.
 * The database follows Stripe through the webhook (lib/org-billing-webhook.ts),
 * never from here, so there is one writer for the mirror. No service role.
 */

/** The Stripe client, only in test mode. */
export function testStripe(): Stripe | null {
  if (!isTestKey(process.env.STRIPE_SECRET_KEY)) return null;
  try {
    return getStripe();
  } catch {
    return null;
  }
}

const EU = new Set(["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"]);

/** The Stripe tax id type for a VAT number, when Stripe has one for it. */
export function vatTaxIdType(vat: string): "gb_vat" | "eu_vat" | null {
  const prefix = vat.slice(0, 2).toUpperCase();
  if (prefix === "GB") return "gb_vat";
  if (EU.has(prefix) || prefix === "EL") return "eu_vat";
  return null;
}

interface LinkCheckRow {
  org_id: string;
  kind: string;
  seats: number;
  legal_name: string;
  display_name: string;
  country: string | null;
  billing_name: string | null;
  billing_email: string | null;
  vat_number: string | null;
}

/**
 * Staff start Stripe billing for a licence (F-220): a customer for the
 * organisation and a subscription with quantity = seats (or 1 for a church
 * band), sent as an invoice with 30 days to pay, by card or Bacs Direct
 * Debit, VAT by Stripe Tax, the PO number on the invoice. The webhook then
 * links the subscription to the licence (metadata licence_id).
 */
export async function startLicenceBilling(a: { licenceId: string; plan: OrgPlanId; poNumber: string | null }): Promise<BillingNotice> {
  const price = orgPriceId(a.plan);
  if (!price) return "not_priced";
  const stripe = testStripe();
  if (!stripe) return "stripe_off";
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("org_billing_link_check", { p_licence: a.licenceId });
  if (error) return billingErrorNotice(error.code);
  const row = (Array.isArray(data) ? data[0] : data) as LinkCheckRow | undefined;
  if (!row) return "failed";
  const plan = ORG_PLANS[a.plan];
  if (plan.licenceKind !== row.kind) return "invalid";

  try {
    const customer = await stripe.customers.create(
      {
        name: row.legal_name,
        email: row.billing_email ?? undefined,
        metadata: { akana_kind: "org_licence", org_id: row.org_id },
        address: row.country ? { country: row.country } : undefined,
        preferred_locales: ["en-GB"],
        invoice_settings: a.poNumber ? { custom_fields: [{ name: "PO number", value: a.poNumber }] } : undefined,
      },
      { idempotencyKey: `org_customer:${a.licenceId}` },
    );
    const taxType = row.vat_number ? vatTaxIdType(row.vat_number) : null;
    if (row.vat_number && taxType) {
      try {
        await stripe.customers.createTaxId(customer.id, { type: taxType, value: row.vat_number });
      } catch {
        // Stripe refuses a malformed number; the invoice still goes out, staff fix it in the dashboard.
        console.warn("org_billing_tax_id_refused", { licence: a.licenceId });
      }
    }
    await stripe.subscriptions.create(
      {
        customer: customer.id,
        items: [{ price, quantity: plan.perSeat ? row.seats : 1 }],
        collection_method: "send_invoice",
        days_until_due: 30,
        automatic_tax: { enabled: true },
        payment_settings: { payment_method_types: ["card", "bacs_debit"] },
        proration_behavior: "create_prorations",
        metadata: { akana_kind: "org_licence", licence_id: a.licenceId, org_id: row.org_id, plan: a.plan },
      },
      { idempotencyKey: `org_subscription:${a.licenceId}` },
    );
  } catch (e) {
    console.error("org_billing_start_failed", { licence: a.licenceId, reason: e instanceof Error ? e.name : "unknown" });
    return "stripe_failed";
  }
  return "billing_started";
}

/**
 * The owner or finance changes the seat count (F-220). A rise is prorated
 * and invoiced now (always_invoice), so an annual customer is not billed a
 * year later for seats used today. A fall is not prorated: Stripe bills the
 * lower number from the next renewal, and 0030 keeps the seats already paid
 * for until then.
 */
export async function changeLicenceSeats(a: { licenceId: string; subscriptionId: string; quantity: number }): Promise<BillingNotice> {
  const stripe = testStripe();
  if (!stripe) return "stripe_off";
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("org_billing_seat_change_check", { p_licence: a.licenceId, p_quantity: a.quantity });
  if (error) return billingErrorNotice(error.code);
  if (data === "same") return "seats_same";
  try {
    const sub = await stripe.subscriptions.retrieve(a.subscriptionId);
    if ((sub.metadata as Record<string, string> | null)?.licence_id && sub.metadata.licence_id !== a.licenceId) return "denied";
    const item = sub.items.data[0];
    if (!item) return "stripe_failed";
    await stripe.subscriptions.update(a.subscriptionId, {
      items: [{ id: item.id, quantity: a.quantity }],
      proration_behavior: data === "up" ? "always_invoice" : "none",
    });
  } catch (e) {
    console.error("org_billing_seats_failed", { licence: a.licenceId, reason: e instanceof Error ? e.name : "unknown" });
    return "stripe_failed";
  }
  return data === "up" ? "seats_up" : "seats_down";
}

/**
 * The owner ends the licence (F-228). Billed in Stripe: the subscription
 * stops at the end of the paid period, and the licence ends when Stripe
 * says so. Otherwise it ends now. Either way members keep their accounts
 * and their work, read only.
 */
export async function endLicence(a: { licenceId: string; subscriptionId: string | null }): Promise<BillingNotice> {
  const supabase = await createUserClient();
  if (a.subscriptionId) {
    const stripe = testStripe();
    if (!stripe) return "stripe_off";
    // The role check runs before Stripe changes anything.
    const { data: role, error: roleErr } = await supabase.rpc("org_billing_end_allowed", { p_licence: a.licenceId });
    if (roleErr || role !== true) return billingErrorNotice(roleErr?.code ?? "AKO01");
    try {
      const sub = await stripe.subscriptions.retrieve(a.subscriptionId);
      if ((sub.metadata as Record<string, string> | null)?.licence_id && sub.metadata.licence_id !== a.licenceId) return "denied";
      if (!sub.cancel_at_period_end && sub.status !== "canceled") await stripe.subscriptions.update(a.subscriptionId, { cancel_at_period_end: true });
    } catch (e) {
      console.error("org_billing_end_failed", { licence: a.licenceId, reason: e instanceof Error ? e.name : "unknown" });
      return "stripe_failed";
    }
  }
  const { data, error } = await supabase.rpc("org_licence_end_request", { p_licence: a.licenceId });
  if (error) return billingErrorNotice(error.code);
  return data === "ended" ? "ended" : "ending";
}

/**
 * Self-serve Checkout (F-226), behind the org_self_serve flag. Card, Stripe
 * Tax, the tax id field, the organiser's own email. The webhook makes the
 * organisation and its licence when the payment goes through; the organiser
 * becomes the owner. Returns the Checkout URL, or a notice.
 */
export async function startSelfServeCheckout(a: { userId: string; email: string | null; origin: string; input: SignupInput }): Promise<{ url: string } | BillingNotice> {
  const supabase = await createUserClient();
  const { data: open } = await supabase.rpc("org_self_serve_open");
  if (open !== true) return "state";
  const price = orgPriceId(a.input.plan);
  if (!price) return "not_priced";
  const stripe = testStripe();
  if (!stripe) return "stripe_off";
  const meta = {
    akana_kind: "org_signup",
    user_id: a.userId,
    plan: a.input.plan,
    org_kind: a.input.orgKind,
    org_name: a.input.name,
    quantity: String(a.input.quantity),
  };
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: a.input.quantity }],
      customer_email: a.email ?? undefined,
      automatic_tax: { enabled: true },
      tax_id_collection: { enabled: true },
      billing_address_collection: "required",
      metadata: meta,
      subscription_data: { metadata: meta },
      success_url: `${a.origin}/org/start?done=1`,
      cancel_url: `${a.origin}/org/start`,
    });
    return session.url ? { url: session.url } : "stripe_failed";
  } catch (e) {
    console.error("org_self_serve_checkout_failed", { reason: e instanceof Error ? e.name : "unknown" });
    return "stripe_failed";
  }
}
