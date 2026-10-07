import type Stripe from "stripe";
import { subscriptionStateFrom, type SubscriptionState } from "@/lib/membership";

/**
 * What the Stripe webhook does with an event, as a pure function over a
 * small repository interface so it can be tested with a fake and no
 * network. The route verifies the signature, builds the Supabase-backed
 * repo and calls handleStripeEvent (F-096).
 *
 * Idempotency has two layers. Here, a purchase already marked paid is not
 * granted again and one already refunded is not revoked again. In the
 * database, app.grant_purchase_entitlement and app.revoke_purchase_entitlement
 * are themselves idempotent, so a race between two deliveries still ends
 * with one entitlement and one audit row.
 *
 * Logging is ids only: event id, type, session id, purchase id. Never an
 * email, a name or a title.
 *
 * Membership (F-097) adds customer.subscription.created, .updated and
 * .deleted, invoice.paid and invoice.payment_failed. Each subscription event
 * reads the subscription fresh from Stripe when it can (so delivery order
 * does not matter), upserts public.subscriptions through
 * app.upsert_subscription, and that function brings the membership
 * entitlement into line. Older observations are ignored in SQL, so a
 * repeated or late event changes nothing. Invoices are recorded by id with
 * amounts only. A failed renewal asks the route to send the payment_failed
 * email, which never names a title (F-098).
 */

export type PurchaseStatus = "pending" | "paid" | "refunded" | "failed";

export interface PurchaseRef {
  id: string;
  status: PurchaseStatus;
}

export interface GrantDetails {
  paymentIntentId: string | null;
  subscriptionId: string | null;
  amountMinor: number | null;
  taxMinor: number | null;
  currency: string | null;
}

export interface PurchaseRepo {
  findBySessionId(sessionId: string): Promise<PurchaseRef | null>;
  findByPaymentIntentId(paymentIntentId: string): Promise<PurchaseRef | null>;
  /** app.grant_purchase_entitlement */
  grant(purchaseId: string, details: GrantDetails): Promise<void>;
  /** app.revoke_purchase_entitlement */
  revoke(purchaseId: string, reason: string): Promise<void>;
  markFailed(purchaseId: string): Promise<void>;
}

export type WebhookAction =
  | "granted"
  | "already_paid"
  | "awaiting_payment"
  | "marked_failed"
  | "revoked"
  | "already_refunded"
  | "partial_refund_kept"
  | "purchase_not_found"
  | "subscription_applied"
  | "subscription_unchanged"
  | "subscription_stale"
  | "subscription_unlinked"
  | "invoice_recorded"
  | "invoice_unchanged"
  | "invoice_unlinked"
  | "ignored";

export type SubscriptionUpsertResult = "applied" | "unchanged" | "stale" | "unlinked";
export type InvoiceRecordResult = "recorded" | "unchanged" | "unlinked";

export interface InvoiceRecord {
  invoiceId: string;
  subscriptionId: string;
  status: "paid" | "failed";
  currency: string;
  amountMinor: number;
  taxMinor: number;
  billingReason: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  at: string;
}

export interface MembershipRepo {
  /** app.upsert_subscription. Also syncs the membership entitlement. */
  upsertSubscription(state: SubscriptionState): Promise<SubscriptionUpsertResult>;
  /** app.sync_membership_entitlement, for a checkout that completed before any subscription state was readable. */
  syncMembership(userId: string, tenantId: string): Promise<void>;
  /** app.record_subscription_invoice */
  recordInvoice(record: InvoiceRecord): Promise<InvoiceRecordResult>;
  /**
   * The subscription as Stripe has it now, or null when it cannot be read.
   * Optional: without it the event's own copy is used, dated by event.created.
   */
  retrieveSubscription?(subscriptionId: string): Promise<Stripe.Subscription | null>;
}

/** An email the route should send. Never carries a title; the template has no title prop (F-098). */
export interface PaymentFailedNotice {
  template: "payment_failed";
  to: string;
  invoiceId: string;
  amountMinor: number | null;
  currency: string | null;
}

export interface WebhookOutcome {
  eventId: string;
  type: string;
  action: WebhookAction;
  purchaseId: string | null;
  /** Set for subscription and invoice events. */
  subscriptionId?: string | null;
  /** Set when the route should send an email. */
  notify?: PaymentFailedNotice;
}

export async function handleStripeEvent(event: Stripe.Event, repo: PurchaseRepo, membership?: MembershipRepo): Promise<WebhookOutcome> {
  const base = { eventId: event.id, type: event.type };

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object;
      // completed fires for delayed methods before the money arrives; the
      // async_payment_succeeded event follows when it does.
      if (session.payment_status === "unpaid") return { ...base, action: "awaiting_payment", purchaseId: null };
      const purchase = await repo.findBySessionId(session.id);
      if (!purchase) return { ...base, action: "purchase_not_found", purchaseId: null };
      if (purchase.status === "refunded") return { ...base, action: "already_refunded", purchaseId: purchase.id };
      const already = purchase.status === "paid";
      if (!already) await repo.grant(purchase.id, grantDetailsFrom(session));
      // A membership: bring the subscription mirror and the entitlement into
      // line now, so the reader is not waiting on customer.subscription.created.
      if (session.mode === "subscription" && membership) await settleMembershipCheckout(session, event, membership);
      return { ...base, action: already ? "already_paid" : "granted", purchaseId: purchase.id };
    }

    case "checkout.session.async_payment_failed": {
      const session = event.data.object;
      const purchase = await repo.findBySessionId(session.id);
      if (!purchase) return { ...base, action: "purchase_not_found", purchaseId: null };
      if (purchase.status !== "pending") return { ...base, action: "ignored", purchaseId: purchase.id };
      await repo.markFailed(purchase.id);
      return { ...base, action: "marked_failed", purchaseId: purchase.id };
    }

    case "charge.refunded": {
      const charge = event.data.object;
      const pi = idOf(charge.payment_intent);
      if (!pi) return { ...base, action: "purchase_not_found", purchaseId: null };
      const purchase = await repo.findByPaymentIntentId(pi);
      if (!purchase) return { ...base, action: "purchase_not_found", purchaseId: null };
      if (purchase.status === "refunded") return { ...base, action: "already_refunded", purchaseId: purchase.id };
      // A partial refund (the pro rata promise, F-096) leaves access in place.
      // Only a full refund closes the gate.
      if (charge.amount_refunded < charge.amount) return { ...base, action: "partial_refund_kept", purchaseId: purchase.id };
      await repo.revoke(purchase.id, "charge.refunded");
      return { ...base, action: "revoked", purchaseId: purchase.id };
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      if (!membership) return { ...base, action: "ignored", purchaseId: null };
      const sub = event.data.object;
      const result = await upsertFresh(sub.id, sub, event, membership);
      return { ...base, action: result ? `subscription_${result}` : "ignored", purchaseId: null, subscriptionId: sub.id };
    }

    case "invoice.paid":
    case "invoice.payment_failed": {
      if (!membership) return { ...base, action: "ignored", purchaseId: null };
      const invoice = event.data.object;
      const subscriptionId = invoiceSubscriptionId(invoice);
      if (!subscriptionId || !invoice.id) return { ...base, action: "ignored", purchaseId: null };
      const failed = event.type === "invoice.payment_failed";
      // Refresh the subscription first so the invoice has a row to hang on.
      await upsertFresh(subscriptionId, null, event, membership);
      const recorded = await membership.recordInvoice({
        invoiceId: invoice.id,
        subscriptionId,
        status: failed ? "failed" : "paid",
        currency: (invoice.currency ?? "gbp").toUpperCase(),
        amountMinor: failed ? (invoice.amount_due ?? 0) : (invoice.amount_paid ?? 0),
        taxMinor: (invoice.total_taxes ?? []).reduce((sum, t) => sum + (t.amount ?? 0), 0),
        billingReason: invoice.billing_reason ?? null,
        periodStart: isoOf(invoice.period_start),
        periodEnd: isoOf(invoice.period_end),
        at: new Date(event.created * 1000).toISOString(),
      });
      const outcome: WebhookOutcome = { ...base, action: `invoice_${recorded}`, purchaseId: null, subscriptionId };
      // One email per failed invoice. The first payment fails on Stripe's own
      // page during checkout, so there is nothing to tell the reader by email.
      if (failed && recorded === "recorded" && invoice.customer_email && invoice.billing_reason !== "subscription_create") {
        outcome.notify = {
          template: "payment_failed",
          to: invoice.customer_email,
          invoiceId: invoice.id,
          amountMinor: invoice.amount_due ?? null,
          currency: invoice.currency ? invoice.currency.toUpperCase() : null,
        };
      }
      return outcome;
    }

    default:
      return { ...base, action: "ignored", purchaseId: null };
  }
}

/**
 * Read the subscription fresh when the repo can, else use the event's copy
 * dated by event.created. Returns null when there is nothing storable.
 */
async function upsertFresh(
  subscriptionId: string,
  fromEvent: Stripe.Subscription | null,
  event: Stripe.Event,
  membership: MembershipRepo,
  fallbackMeta?: { user_id?: string | null; tenant_id?: string | null } | null,
): Promise<SubscriptionUpsertResult | null> {
  let sub: Stripe.Subscription | null = null;
  let observedAt = new Date(event.created * 1000);
  if (membership.retrieveSubscription) {
    const fresh = await membership.retrieveSubscription(subscriptionId);
    if (fresh) {
      sub = fresh;
      observedAt = new Date();
    }
  }
  sub ??= fromEvent;
  if (!sub) return null;
  const state = subscriptionStateFrom(sub, observedAt, fallbackMeta);
  if (!state) return null;
  return membership.upsertSubscription(state);
}

async function settleMembershipCheckout(session: Stripe.Checkout.Session, event: Stripe.Event, membership: MembershipRepo): Promise<void> {
  const subscriptionId = idOf(session.subscription);
  const meta = (session.metadata ?? {}) as Record<string, string | undefined>;
  const result = subscriptionId ? await upsertFresh(subscriptionId, null, event, membership, meta) : null;
  if (result === null && meta.user_id && meta.tenant_id) await membership.syncMembership(meta.user_id, meta.tenant_id);
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const details = invoice.parent?.subscription_details;
  return details ? idOf(details.subscription as string | { id: string } | null) : null;
}

function isoOf(seconds: number | null | undefined): string | null {
  return typeof seconds === "number" && Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : null;
}

function grantDetailsFrom(session: Stripe.Checkout.Session): GrantDetails {
  return {
    paymentIntentId: idOf(session.payment_intent),
    subscriptionId: idOf(session.subscription),
    amountMinor: session.amount_total ?? null,
    taxMinor: session.total_details?.amount_tax ?? null,
    currency: session.currency ? session.currency.toUpperCase() : null,
  };
}

function idOf(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}
