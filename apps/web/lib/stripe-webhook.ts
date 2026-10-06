import type Stripe from "stripe";

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
  | "ignored";

export interface WebhookOutcome {
  eventId: string;
  type: string;
  action: WebhookAction;
  purchaseId: string | null;
}

export async function handleStripeEvent(event: Stripe.Event, repo: PurchaseRepo): Promise<WebhookOutcome> {
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
      if (purchase.status === "paid") return { ...base, action: "already_paid", purchaseId: purchase.id };
      if (purchase.status === "refunded") return { ...base, action: "already_refunded", purchaseId: purchase.id };
      await repo.grant(purchase.id, grantDetailsFrom(session));
      return { ...base, action: "granted", purchaseId: purchase.id };
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

    default:
      return { ...base, action: "ignored", purchaseId: null };
  }
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
