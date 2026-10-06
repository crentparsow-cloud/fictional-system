import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe, getWebhookSecret } from "@/lib/stripe";
import { handleStripeEvent, type GrantDetails, type PurchaseRef, type PurchaseRepo } from "@/lib/stripe-webhook";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Stripe platform webhook (F-096). POST /api/stripe/webhook
 *
 * The signature is checked against STRIPE_WEBHOOK_SECRET over the raw body.
 * In the App Router there is no body parser to switch off: request.text()
 * returns the bytes as sent, which is what constructEvent needs. The Node
 * runtime is required because the stripe package uses Node crypto.
 *
 * Handled: checkout.session.completed and async_payment_succeeded grant the
 * entitlement through app.grant_purchase_entitlement (rpc, admin client);
 * async_payment_failed marks the purchase failed; charge.refunded marks it
 * refunded and revokes through app.revoke_purchase_entitlement. Everything
 * else is acknowledged and ignored. Always 200 once the signature is good,
 * so Stripe does not retry what we have already handled; a database error
 * is a 500 so Stripe does retry.
 *
 * Logs carry ids only: event id, type, action, purchase id.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "missing_signature" }, { status: 400 });

  const raw = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, signature, getWebhookSecret());
  } catch (err) {
    console.warn("stripe webhook: signature rejected", { reason: err instanceof Error ? err.name : "unknown" });
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  try {
    const outcome = await handleStripeEvent(event, supabaseRepo());
    console.info("stripe webhook", outcome);
    return NextResponse.json({ received: true, action: outcome.action });
  } catch (err) {
    console.error("stripe webhook: handler failed", { event: event.id, type: event.type, reason: err instanceof Error ? err.message : "unknown" });
    return NextResponse.json({ error: "handler_failed" }, { status: 500 });
  }
}

/**
 * The repository over the service role client. Readers have no write grant
 * on purchases or entitlements; the SQL functions check that the caller is
 * the service role before they change anything.
 */
function supabaseRepo(): PurchaseRepo {
  const admin = createAdminClient();
  const find = async (column: string, value: string): Promise<PurchaseRef | null> => {
    const { data, error } = await admin.from("purchases").select("id, status").eq(column, value).maybeSingle();
    if (error) throw new Error(`purchases lookup failed: ${error.code ?? error.message}`);
    return (data as PurchaseRef | null) ?? null;
  };
  return {
    findBySessionId: (id) => find("stripe_checkout_session_id", id),
    findByPaymentIntentId: (id) => find("stripe_payment_intent_id", id),
    async grant(purchaseId: string, d: GrantDetails) {
      const { error } = await admin.rpc("grant_purchase_entitlement", {
        p_purchase: purchaseId,
        p_payment_intent: d.paymentIntentId,
        p_subscription: d.subscriptionId,
        p_amount_minor: d.amountMinor,
        p_tax_minor: d.taxMinor,
        p_currency: d.currency,
      });
      if (error) throw new Error(`grant failed: ${error.code ?? error.message}`);
    },
    async revoke(purchaseId: string, reason: string) {
      const { error } = await admin.rpc("revoke_purchase_entitlement", { p_purchase: purchaseId, p_reason: reason });
      if (error) throw new Error(`revoke failed: ${error.code ?? error.message}`);
    },
    async markFailed(purchaseId: string) {
      const { error } = await admin.from("purchases").update({ status: "failed" }).eq("id", purchaseId).eq("status", "pending");
      if (error) throw new Error(`mark failed failed: ${error.code ?? error.message}`);
    },
  };
}
