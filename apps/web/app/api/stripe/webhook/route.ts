import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { sendMembershipNotice } from "@/lib/membership-email";
import { sendPurchaseEmail, type TrialExtras } from "@/lib/purchase-email";
import { loadFirstWeekPlan } from "@/lib/first-week-plan-server";
import { PRICE_LADDER } from "@/lib/pricing";
import { cancelInCoolingOff } from "@/lib/membership-refund";
import { getStripe, getWebhookSecret } from "@/lib/stripe";
import {
  handleStripeEvent,
  type GrantDetails,
  type MembershipConfirmedNotice,
  type MembershipNotice,
  type MembershipRepo,
  type PurchaseRef,
  type PurchaseRepo,
  type ReaderMailNotice,
} from "@/lib/stripe-webhook";
import { createAdminClient } from "@/lib/supabase/admin";
import { countFunnelEvent, membershipFunnelEvent } from "@/lib/funnel";
import { mailLog } from "@/lib/mail-ops";
import { reportOps } from "@/lib/ops-alerts";
import { handleConnectWebhook, isConnectEvent } from "@/lib/payouts/connect-route";
import { ledgerRepo } from "@/lib/money/ledger-repo";
import { handleOrgBillingWebhook, isOrgBillingEvent } from "@/lib/org-billing-webhook";

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
 * Royalty ledger (F-100, migration 0021): paid purchases and invoices,
 * refunds and disputes (charge.dispute.created and .closed) write ledger
 * rows through lib/money/ledger-repo.ts.
 *
 * Confirmation emails (0031 mail gaps): purchase_lifetime when a single
 * purchase is paid, purchase_membership on the first paid membership
 * invoice, and refund_confirmed on charge.refunded for a single purchase
 * (a dashboard refund included), each once through public.email_claims.
 * The refund key is refund:<re_ id>, the one the refund console claims, so
 * the two never both send. Best effort, like the membership emails.
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
    // Connect events (F-099) may come from a Connect endpoint with its own secret.
    const connectSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
    try {
      if (!connectSecret) throw err;
      event = getStripe().webhooks.constructEvent(raw, signature, connectSecret);
    } catch {
      console.warn("stripe webhook: signature rejected", { reason: err instanceof Error ? err.name : "unknown" });
      return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
    }
  }

  // Connected account events (account.updated, payout bank changes) go to lib/payouts.
  if (isConnectEvent(event)) return handleConnectWebhook(event, siteOrigin(request));
  // Organisation billing (F-220, migration 0030): lib/org-billing-webhook.ts.
  if (isOrgBillingEvent(event)) return handleOrgBillingWebhook(event);

  try {
    const admin = createAdminClient();
    const outcome = await handleStripeEvent(event, supabaseRepo(admin), membershipRepo(admin), ledgerRepo(admin, getStripe()));
    const { notify, mail, ...logged } = outcome;
    console.info("stripe webhook", logged);
    if (notify) await sendNotice(admin, notify, siteOrigin(request));
    for (const n of mail ?? []) await sendMail(admin, n, siteOrigin(request));
    if (outcome.action === "granted") await countPurchase(admin, event);
    if (outcome.action === "subscription_applied" || outcome.action === "cooling_off_cancelled") await countMembership(admin, event);
    return NextResponse.json({ received: true, action: outcome.action });
  } catch (err) {
    console.error("stripe webhook: handler failed", { event: event.id, type: event.type, reason: err instanceof Error ? err.message : "unknown" });
    // F-142: one alert email when this opens an alert. Never throws.
    try {
      await reportOps(createAdminClient(), "webhook_failure", "api/stripe/webhook", "handler_failed");
    } catch {
      console.error("stripe webhook: ops report unavailable");
    }
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
    const { data, error } = await admin.from("purchases").select("id, status, user_id").eq(column, value).maybeSingle();
    if (error) throw new Error(`purchases lookup failed: ${error.code ?? error.message}`);
    const row = data as { id: string; status: PurchaseRef["status"]; user_id: string | null } | null;
    return row ? { id: row.id, status: row.status, userId: row.user_id } : null;
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
    // Email lookups never fail the webhook: no address means no email.
    async readerContact(userId: string) {
      try {
        const { data, error } = await admin.auth.admin.getUserById(userId);
        if (error || !data?.user?.email) return null;
        const { data: profile } = await admin.from("profiles").select("display_name").eq("user_id", userId).maybeSingle();
        return { email: data.user.email, name: (profile as { display_name?: string | null } | null)?.display_name ?? null };
      } catch {
        return null;
      }
    },
    async listRefunds(paymentIntentId: string) {
      try {
        const refunds = await getStripe().refunds.list({ payment_intent: paymentIntentId, limit: 100 });
        return refunds.data.map((r) => ({ id: r.id, amountMinor: r.amount, currency: r.currency, status: r.status ?? null }));
      } catch {
        return [];
      }
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
      log: mailLog("api/stripe/webhook", "membership_email"),
    });
  } catch (err) {
    console.error("membership_email_failed", { template: n.template, reason: err instanceof Error ? err.name : "unknown" });
  }
}

/**
 * The confirmation emails (purchase, membership, refund). Best effort, like
 * sendNotice: claimed in public.email_claims before the send, released if
 * it fails, failures reported through lib/mail-ops.ts. Never a title.
 */
async function sendMail(admin: Admin, n: ReaderMailNotice, origin: string): Promise<void> {
  try {
    const env = process.env;
    // 14.20: the day-zero email of a trial carries the first week's plan and the renewal price.
    const extras = n.template === "purchase_membership" && n.trial ? await trialExtras(admin, n) : {};
    const status = await sendPurchaseEmail(n, origin, {
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
        if (error) console.error("purchase_email_release_failed", { code: error.code ?? "unknown" });
      },
      log: mailLog("api/stripe/webhook", "purchase_email"),
    }, extras);
    if (status === "no_figures") console.warn("purchase_email_no_figures", { template: n.template });
  } catch (err) {
    console.error("purchase_email_failed", { template: n.template, reason: err instanceof Error ? err.name : "unknown" });
  }
}

/** The first week's plan and the price the trial renews at, for the day-zero email. Best effort. */
async function trialExtras(admin: Admin, n: MembershipConfirmedNotice): Promise<TrialExtras> {
  const firstWeek = await loadFirstWeekPlan(admin, n.userId);
  const point = n.plan;
  const { data } = await admin.from("price_points").select("amounts").eq("id", point).maybeSingle();
  const amounts = (data?.amounts ?? PRICE_LADDER[point].amounts) as Record<string, number | undefined>;
  const renewalMinor = amounts[n.currency] ?? null;
  return { firstWeek, renewalMinor };
}

/** The public origin for links in the email, from the proxy's headers. */
function siteOrigin(request: NextRequest): string {
  const host = process.env.AKANA_HOST ?? request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}

/**
 * F-141: count a completed purchase. Server to server, so there is no
 * visitor opt-out to read; the count carries the tenant and workbook ids
 * from the session metadata and nothing about the buyer beyond the daily
 * hash of their id (0036), so one buyer is one unique. Best effort.
 */
async function countPurchase(admin: Admin, event: Stripe.Event): Promise<void> {
  const obj = event.data.object as { metadata?: Record<string, string> | null };
  const tenantId = obj.metadata?.tenant_id;
  if (!tenantId) return;
  await countFunnelEvent(admin, "purchase", { tenantId, workbookId: obj.metadata?.workbook_id ?? null, headers: null, userId: obj.metadata?.user_id ?? null });
}

/**
 * 0036: trial_started, trial_cancelled or membership_cancelled from a
 * subscription event that changed our row. Counts only, the same way.
 */
async function countMembership(admin: Admin, event: Stripe.Event): Promise<void> {
  const kind = membershipFunnelEvent(event as unknown as Parameters<typeof membershipFunnelEvent>[0]);
  if (!kind) return;
  const obj = event.data.object as { metadata?: Record<string, string> | null };
  const tenantId = obj.metadata?.tenant_id;
  if (!tenantId) return;
  await countFunnelEvent(admin, kind, { tenantId, workbookId: null, headers: null, userId: obj.metadata?.user_id ?? null });
}
