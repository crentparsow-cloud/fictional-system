import type Stripe from "stripe";

/**
 * Gift memberships on the Stripe webhook (5.6, 5.7), with every outside effect
 * passed in so the rules are tested without a database or a mail server.
 * app/api/stripe/webhook/route.ts hands an event here before the membership
 * code sees it. handleGiftEvent returns null for an event that is not about a
 * gift, so the ordinary path carries on.
 *
 *   checkout.session.completed, async_payment_succeeded
 *       A session whose metadata says kind gift and which is paid: the gift is
 *       marked paid, the claim email goes to the recipient and a note to the
 *       buyer. A repeat delivery sends nothing new. If the email failed the
 *       first time, the next delivery tries again, because the gift is only
 *       marked delivered once it has gone.
 *   checkout.session.async_payment_failed, checkout.session.expired
 *       The pending gift is closed and its address and link are dropped.
 *   charge.refunded
 *       A full refund of a gift's payment ends the gift at once, claimed or
 *       not. A partial refund is left for staff and said so in the outcome.
 *   charge.dispute.created
 *       A dispute on a gift's payment ends the gift the same way.
 *
 * Nothing renews: there is no subscription in this path at all.
 */

export interface PaidGift {
  id: string;
  buyerId: string | null;
  months: number;
  recipientEmail: string | null;
  recipientName: string | null;
  senderName: string | null;
  message: string | null;
  token: string | null;
  claimBy: string | null;
  delivered: boolean;
  changed: boolean;
}

export interface GiftRepo {
  markPaid(a: { session: string; paymentIntent: string | null; amountMinor: number | null; taxMinor: number | null; currency: string | null }): Promise<PaidGift | null>;
  markDelivered(id: string): Promise<void>;
  markFailed(session: string): Promise<void>;
  findByPaymentIntent(paymentIntent: string): Promise<{ id: string } | null>;
  refund(paymentIntent: string): Promise<{ changed: boolean; wasClaimed: boolean }>;
  buyerContact(userId: string): Promise<{ email: string; name: string | null } | null>;
}

export interface GiftMail {
  /** True when the claim email has gone (or was sent on an earlier delivery). */
  received(g: PaidGift): Promise<boolean>;
  /** Best effort. */
  sent(g: PaidGift, buyer: { email: string; name: string | null }): Promise<void>;
}

export type GiftAction = "gift_paid" | "gift_repeat" | "gift_unpaid" | "gift_unknown" | "gift_failed" | "gift_refunded" | "gift_refund_repeat" | "gift_partial_refund" | "gift_disputed";
export interface GiftOutcome {
  action: GiftAction;
  giftId: string | null;
  delivered?: boolean;
}

const idOf = (v: string | { id: string } | null | undefined): string | null => (typeof v === "string" ? v : (v?.id ?? null));

export function isGiftSession(obj: { metadata?: Record<string, string> | null } | null | undefined): boolean {
  return obj?.metadata?.kind === "gift";
}

export async function handleGiftEvent(event: Stripe.Event, repo: GiftRepo, mail: GiftMail): Promise<GiftOutcome | null> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = event.data.object as Stripe.Checkout.Session;
      if (!isGiftSession(s)) return null;
      if (s.payment_status !== "paid") return { action: "gift_unpaid", giftId: null };
      const gift = await repo.markPaid({
        session: s.id,
        paymentIntent: idOf(s.payment_intent as string | { id: string } | null),
        amountMinor: s.amount_total ?? null,
        taxMinor: s.total_details?.amount_tax ?? null,
        currency: s.currency ? s.currency.toUpperCase() : null,
      });
      if (!gift) return { action: "gift_unknown", giftId: null };
      if (gift.delivered) return { action: "gift_repeat", giftId: gift.id, delivered: true };
      const delivered = gift.recipientEmail && gift.token ? await mail.received(gift) : false;
      if (delivered) {
        await repo.markDelivered(gift.id);
        if (gift.changed && gift.buyerId) {
          const buyer = await repo.buyerContact(gift.buyerId);
          if (buyer) await mail.sent(gift, buyer);
        }
      }
      return { action: "gift_paid", giftId: gift.id, delivered };
    }
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired": {
      const s = event.data.object as Stripe.Checkout.Session;
      if (!isGiftSession(s)) return null;
      await repo.markFailed(s.id);
      return { action: "gift_failed", giftId: null };
    }
    case "charge.refunded": {
      const c = event.data.object as Stripe.Charge;
      const pi = idOf(c.payment_intent as string | { id: string } | null);
      if (!pi) return null;
      const found = await repo.findByPaymentIntent(pi);
      if (!found) return null;
      if (!c.refunded) return { action: "gift_partial_refund", giftId: found.id };
      const r = await repo.refund(pi);
      return { action: r.changed ? "gift_refunded" : "gift_refund_repeat", giftId: found.id };
    }
    case "charge.dispute.created": {
      const d = event.data.object as Stripe.Dispute;
      const pi = idOf(d.payment_intent as string | { id: string } | null);
      if (!pi) return null;
      const found = await repo.findByPaymentIntent(pi);
      if (!found) return null;
      const r = await repo.refund(pi);
      return { action: r.changed ? "gift_disputed" : "gift_refund_repeat", giftId: found.id };
    }
    default:
      return null;
  }
}
