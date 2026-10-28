import "server-only";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { handleBundleEvent, type BundleRepo } from "@/lib/bundle-webhook";
import { sendGiftReceived, sendGiftSent } from "@/lib/conversion-mail";
import { handleGiftEvent, type GiftMail, type GiftRepo, type PaidGift } from "@/lib/gift-webhook";
import { reportOps } from "@/lib/ops-alerts";
import { createAdminClient } from "@/lib/supabase/admin";
import { countEventServer } from "@/lib/funnel";
import { MARKETPLACE_TENANT_ID } from "@/lib/tenant";

/**
 * The Stripe webhook's hand-off for gifts (5.6, 5.7) and Theme bundles
 * (5.8). app/api/stripe/webhook/route.ts calls handleConversionEvent after
 * the signature check and before the membership code. It returns null for
 * an event that is not a gift or a bundle, and the ordinary path carries on.
 * Otherwise it returns the response to send: 200 once handled, 500 on a
 * database error so Stripe retries.
 *
 * Logs carry ids and the action only. Addresses and messages are never logged.
 */
type Admin = ReturnType<typeof createAdminClient>;

type PaidRow = {
  found: boolean;
  changed?: boolean;
  id?: string;
  buyer_id?: string | null;
  months?: number;
  recipient_email?: string | null;
  recipient_name?: string | null;
  sender_name?: string | null;
  message?: string | null;
  token?: string | null;
  delivered?: boolean;
};

export function giftRepo(admin: Admin): GiftRepo {
  return {
    async markPaid(a) {
      const { data, error } = await admin.rpc("gift_mark_paid", {
        p_session: a.session,
        p_payment_intent: a.paymentIntent,
        p_amount_minor: a.amountMinor,
        p_tax_minor: a.taxMinor,
        p_currency: a.currency,
      });
      if (error) throw new Error(`gift_mark_paid failed: ${error.code ?? error.message}`);
      const r = data as PaidRow;
      if (!r?.found || !r.id) return null;
      // The claim window end is read separately: it is not part of the function's answer.
      const { data: row } = await admin.from("gift_memberships").select("claim_by").eq("id", r.id).maybeSingle();
      return {
        id: r.id,
        buyerId: r.buyer_id ?? null,
        months: r.months ?? 0,
        recipientEmail: r.recipient_email ?? null,
        recipientName: r.recipient_name ?? null,
        senderName: r.sender_name ?? null,
        message: r.message ?? null,
        token: r.token ?? null,
        claimBy: (row as { claim_by: string | null } | null)?.claim_by ?? null,
        delivered: Boolean(r.delivered),
        changed: Boolean(r.changed),
      } satisfies PaidGift;
    },
    async markDelivered(id) {
      const { error } = await admin.rpc("gift_mark_delivered", { p_id: id });
      if (error) throw new Error(`gift_mark_delivered failed: ${error.code ?? error.message}`);
    },
    async markFailed(session) {
      const { error } = await admin.rpc("gift_mark_failed", { p_session: session });
      if (error) throw new Error(`gift_mark_failed failed: ${error.code ?? error.message}`);
    },
    async findByPaymentIntent(pi) {
      const { data, error } = await admin.from("gift_memberships").select("id").eq("stripe_payment_intent_id", pi).maybeSingle();
      if (error) throw new Error(`gift lookup failed: ${error.code ?? error.message}`);
      return data ? { id: (data as { id: string }).id } : null;
    },
    async refund(pi) {
      const { data, error } = await admin.rpc("gift_refund", { p_payment_intent: pi });
      if (error) throw new Error(`gift_refund failed: ${error.code ?? error.message}`);
      const r = data as { changed?: boolean; was_claimed?: boolean };
      return { changed: Boolean(r?.changed), wasClaimed: Boolean(r?.was_claimed) };
    },
    async buyerContact(userId) {
      try {
        const { data, error } = await admin.auth.admin.getUserById(userId);
        if (error || !data?.user?.email) return null;
        const { data: profile } = await admin.from("profiles").select("display_name").eq("user_id", userId).maybeSingle();
        return { email: data.user.email, name: (profile as { display_name?: string | null } | null)?.display_name ?? null };
      } catch {
        return null;
      }
    },
  };
}

export function giftMail(origin: string): GiftMail {
  return {
    async received(g) {
      if (!g.recipientEmail || !g.token) return false;
      return sendGiftReceived(
        { id: g.id, months: g.months, recipientEmail: g.recipientEmail, recipientName: g.recipientName, senderName: g.senderName, message: g.message, token: g.token, claimBy: g.claimBy },
        { origin },
      );
    },
    async sent(g, buyer) {
      await sendGiftSent({ id: g.id, months: g.months, recipientName: g.recipientName, claimBy: g.claimBy }, { ...buyer, userId: g.buyerId ?? "" }, { origin });
    },
  };
}

export function bundleRepo(admin: Admin): BundleRepo {
  return {
    async markPaid(a) {
      const { data, error } = await admin.rpc("bundle_mark_paid", {
        p_session: a.session,
        p_payment_intent: a.paymentIntent,
        p_amount_minor: a.amountMinor,
        p_tax_minor: a.taxMinor,
      });
      if (error) throw new Error(`bundle_mark_paid failed: ${error.code ?? error.message}`);
      const r = data as { found?: boolean; changed?: boolean; id?: string };
      return { found: Boolean(r?.found), changed: Boolean(r?.changed), id: r?.id ?? null };
    },
    async markFailed(session) {
      const { error } = await admin.rpc("bundle_mark_failed", { p_session: session });
      if (error) throw new Error(`bundle_mark_failed failed: ${error.code ?? error.message}`);
    },
    async findByPaymentIntent(pi) {
      const { data, error } = await admin.from("bundle_purchases").select("id").eq("stripe_payment_intent_id", pi).maybeSingle();
      if (error) throw new Error(`bundle lookup failed: ${error.code ?? error.message}`);
      return data ? { id: (data as { id: string }).id } : null;
    },
    async refund(pi) {
      const { data, error } = await admin.rpc("bundle_refund", { p_payment_intent: pi });
      if (error) throw new Error(`bundle_refund failed: ${error.code ?? error.message}`);
      return { changed: Boolean((data as { changed?: boolean })?.changed) };
    },
  };
}

const CONVERSION_EVENTS = new Set<string>([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "charge.refunded",
  "charge.dispute.created",
]);

export async function handleConversionEvent(event: Stripe.Event, origin: string): Promise<NextResponse | null> {
  if (!CONVERSION_EVENTS.has(event.type)) return null;
  // A session that is neither a gift nor a bundle never needs the database.
  if (event.type.startsWith("checkout.session.")) {
    const kind = (event.data.object as Stripe.Checkout.Session).metadata?.kind;
    if (kind !== "gift" && kind !== "bundle") return null;
  }
  try {
    const admin = createAdminClient();
    const gift = await handleGiftEvent(event, giftRepo(admin), giftMail(origin));
    const tenantId = (event.data.object as { metadata?: Record<string, string> | null }).metadata?.tenant_id ?? MARKETPLACE_TENANT_ID;
    if (gift) {
      if (gift.action === "gift_paid") await countEventServer(admin, "gift_bought", { tenantId });
      console.info("stripe webhook gift", { event: event.id, type: event.type, action: gift.action, gift: gift.giftId });
      return NextResponse.json({ received: true, action: gift.action });
    }
    const bundle = await handleBundleEvent(event, bundleRepo(admin));
    if (bundle) {
      if (bundle.action === "bundle_paid") await countEventServer(admin, "bundle_bought", { tenantId });
      console.info("stripe webhook bundle", { event: event.id, type: event.type, action: bundle.action, bundle: bundle.bundleId });
      return NextResponse.json({ received: true, action: bundle.action });
    }
    return null;
  } catch (err) {
    console.error("stripe webhook conversion failed", { event: event.id, type: event.type, reason: err instanceof Error ? err.message : "unknown" });
    try {
      await reportOps(createAdminClient(), "webhook_failure", "api/stripe/webhook", "conversion_failed");
    } catch {
      console.error("stripe webhook conversion: ops report unavailable");
    }
    return NextResponse.json({ error: "handler_failed" }, { status: 500 });
  }
}
