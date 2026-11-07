import type Stripe from "stripe";

/**
 * Theme bundles on the Stripe webhook (5.8), the same shape as the gift
 * handler: effects passed in, null for an event that is not about a bundle.
 * A paid bundle session opens each title for the buyer. A full refund of the
 * payment closes the access the bundle gave, and so does a dispute opened on
 * it (charge.dispute.created), as for a single purchase. Titles the buyer
 * owned another way are left alone by the database function.
 */

export interface BundleRepo {
  markPaid(a: { session: string; paymentIntent: string | null; amountMinor: number | null; taxMinor: number | null }): Promise<{ found: boolean; changed: boolean; id: string | null }>;
  markFailed(session: string): Promise<void>;
  findByPaymentIntent(paymentIntent: string): Promise<{ id: string } | null>;
  refund(paymentIntent: string): Promise<{ changed: boolean }>;
}

export type BundleAction = "bundle_paid" | "bundle_repeat" | "bundle_unpaid" | "bundle_unknown" | "bundle_failed" | "bundle_refunded" | "bundle_refund_repeat" | "bundle_partial_refund" | "bundle_disputed";
export interface BundleOutcome {
  action: BundleAction;
  bundleId: string | null;
}

const idOf = (v: string | { id: string } | null | undefined): string | null => (typeof v === "string" ? v : (v?.id ?? null));

export function isBundleSession(obj: { metadata?: Record<string, string> | null } | null | undefined): boolean {
  return obj?.metadata?.kind === "bundle";
}

export async function handleBundleEvent(event: Stripe.Event, repo: BundleRepo): Promise<BundleOutcome | null> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = event.data.object as Stripe.Checkout.Session;
      if (!isBundleSession(s)) return null;
      if (s.payment_status !== "paid") return { action: "bundle_unpaid", bundleId: null };
      const r = await repo.markPaid({
        session: s.id,
        paymentIntent: idOf(s.payment_intent as string | { id: string } | null),
        amountMinor: s.amount_total ?? null,
        taxMinor: s.total_details?.amount_tax ?? null,
      });
      if (!r.found) return { action: "bundle_unknown", bundleId: null };
      return { action: r.changed ? "bundle_paid" : "bundle_repeat", bundleId: r.id };
    }
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired": {
      const s = event.data.object as Stripe.Checkout.Session;
      if (!isBundleSession(s)) return null;
      await repo.markFailed(s.id);
      return { action: "bundle_failed", bundleId: null };
    }
    case "charge.refunded": {
      const c = event.data.object as Stripe.Charge;
      const pi = idOf(c.payment_intent as string | { id: string } | null);
      if (!pi) return null;
      const found = await repo.findByPaymentIntent(pi);
      if (!found) return null;
      if (!c.refunded) return { action: "bundle_partial_refund", bundleId: found.id };
      const r = await repo.refund(pi);
      return { action: r.changed ? "bundle_refunded" : "bundle_refund_repeat", bundleId: found.id };
    }
    case "charge.dispute.created": {
      const d = event.data.object as Stripe.Dispute;
      const pi = idOf(d.payment_intent as string | { id: string } | null);
      if (!pi) return null;
      const found = await repo.findByPaymentIntent(pi);
      if (!found) return null;
      const r = await repo.refund(pi);
      return { action: r.changed ? "bundle_disputed" : "bundle_refund_repeat", bundleId: found.id };
    }
    default:
      return null;
  }
}
