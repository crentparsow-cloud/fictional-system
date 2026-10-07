import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { sendMembershipNotice } from "@/lib/membership-email";
import { cancelInCoolingOff } from "@/lib/membership-refund";
import { getStripe, getWebhookSecret } from "@/lib/stripe";
import {
  handleStripeEvent,
  type GrantDetails,
  type MembershipNotice,
  type MembershipRepo,
  type PurchaseRef,
  type PurchaseRepo,
} from "@/lib/stripe-webhook";
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
 * else is acknowledged and ignored.
 *
 * Membership (F-097): customer.subscription.created, .updated and .deleted
 * upsert public.subscriptions through app.upsert_subscription, which keeps
 * the membership entitlement in step; invoice.paid and
 * invoice.payment_failed record the invoice through
 * app.record_subscription_invoice. A failed renewal sends the payment_failed
 * email, best effort, with no title in it (F-098). invoice.upcoming for an
 * annual membership sends the renewal_notice reminder (DMCC subscription
 * regime), once per subscription and renewal date: the dedupe key is claimed
 * in public.email_claims (migration 0010) before the send.
 *
 * A portal cancel within 14 days of the membership starting ends it now and
 * refunds the unused days pro rata (refund policy section 2,
 * lib/membership-refund.ts). A Stripe error there is a 500, so Stripe
 * retries; the refund is guarded once per invoice. The cancellation email
 * follows, with the refund, once per subscription. An ordinary cancel at
 * period end sends the cancellation email with the end date, once. A cancel
 * made by account deletion sends none: account_deleted covers it.
 *
 * Always 200 once the signature is good,
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
    const admin = createAdminClient();
    const outcome = await handleStripeEvent(event, supabaseRepo(admin), membershipRepo(admin));
    const { notify, ...logged } = outcome;
    console.info("stripe webhook", logged);
    if (notify) await sendNotice(admin, notify, siteOrigin(request));
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
type Admin = ReturnType<typeof createAdminClient>;

function supabaseRepo(admin: Admin): PurchaseRepo {
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

/** The membership side over the same service role client (migration 0009). */
function membershipRepo(admin: Admin): MembershipRepo {
  return {
    async upsertSubscription(st) {
      const { data, error } = await admin.rpc("upsert_subscription", {
        p_subscription: st.subscriptionId,
        p_customer: st.customerId,
        p_user: st.userId,
        p_tenant: st.tenantId,
        p_status: st.status,
        p_plan: st.plan,
        p_price: st.priceId,
        p_current_period_end: st.currentPeriodEnd,
        p_cancel_at_period_end: st.cancelAtPeriodEnd,
        p_cancel_at: st.cancelAt,
        p_canceled_at: st.canceledAt,
        p_ended_at: st.endedAt,
        p_observed_at: st.observedAt,
      });
      if (error) throw new Error(`upsert_subscription failed: ${error.code ?? error.message}`);
      return data as "applied" | "unchanged" | "stale" | "unlinked";
    },
    async syncMembership(userId, tenantId) {
      const { error } = await admin.rpc("sync_membership_entitlement", { p_user: userId, p_tenant: tenantId });
      if (error) throw new Error(`sync_membership_entitlement failed: ${error.code ?? error.message}`);
    },
    async recordInvoice(r) {
      const { data, error } = await admin.rpc("record_subscription_invoice", {
        p_invoice: r.invoiceId,
        p_subscription: r.subscriptionId,
        p_status: r.status,
        p_currency: r.currency,
        p_amount_minor: r.amountMinor,
        p_tax_minor: r.taxMinor,
        p_billing_reason: r.billingReason,
        p_period_start: r.periodStart,
        p_period_end: r.periodEnd,
        p_at: r.at,
      });
      if (error) throw new Error(`record_subscription_invoice failed: ${error.code ?? error.message}`);
      return data as "recorded" | "unchanged" | "unlinked";
    },
    async retrieveSubscription(id) {
      try {
        return await getStripe().subscriptions.retrieve(id);
      } catch {
        // fall back to the event's own copy
        return null;
      }
    },
    async cancelInCoolingOff(id, requestedAt) {
      return cancelInCoolingOff(getStripe(), id, { now: new Date(), requestedAt });
    },
    async customerEmail(id) {
      try {
        const c = await getStripe().customers.retrieve(id);
        return "deleted" in c && c.deleted ? null : (c.email ?? null);
      } catch {
        return null;
      }
    },
  };
}

/**
 * The membership emails (F-097): payment_failed, renewal_notice and
 * cancellation. Best
 * effort: a send failure is logged and never turns into a webhook retry.
 * The templates carry the amount and the account link only, never a title
 * (F-098). The dedupe key is claimed in public.email_claims before the send
 * and released if it fails. Without RESEND_API_KEY the mailer records the
 * send in its dev transport and nothing leaves.
 */
async function sendNotice(admin: Admin, n: MembershipNotice, origin: string): Promise<void> {
  try {
    const env = process.env;
    await sendMembershipNotice(n, origin, {
      env: {
        RESEND_API_KEY: env.RESEND_API_KEY,
        EMAIL_FROM: env.EMAIL_FROM,
        EMAIL_REPLY_TO: env.EMAIL_REPLY_TO,
        POSTAL_ADDRESS: env.POSTAL_ADDRESS,
        EMAIL_MODE: env.EMAIL_MODE,
        TEST_RECIPIENT: env.TEST_RECIPIENT,
      },
      async claim(key) {
        const { data, error } = await admin.rpc("claim_email", { p_key: key });
        if (error) throw new Error(`claim_email failed: ${error.code ?? error.message}`);
        return data === true;
      },
      async release(key) {
        const { error } = await admin.rpc("release_email", { p_key: key });
        if (error) console.error("membership_email_release_failed", { code: error.code ?? "unknown" });
      },
      log: (e) => console.info("membership_email", e.template, e.status, e.reason ?? ""),
    });
  } catch (err) {
    console.error("membership_email_failed", { template: n.template, reason: err instanceof Error ? err.name : "unknown" });
  }
}

/** The public origin for links in the email, from the proxy's headers. */
function siteOrigin(request: NextRequest): string {
  const host = process.env.AKANA_HOST ?? request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}
