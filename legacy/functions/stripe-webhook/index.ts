// stripe-webhook: the only place entitlements are written.
// Verifies Stripe's signature, processes each event once, and keeps access in step with payments.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@17";
import { createClient } from "npm:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { httpClient: Stripe.createFetchHttpClient() });
const crypto = Stripe.createSubtleCryptoProvider();
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// Confirmation emails go through the notify function, so every email is sent from one place.
async function notifyTxn(body: Record<string, unknown>) {
  try {
    const { data: secret } = await admin.rpc("server_secret");
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/app/notify`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-server-secret": String(secret) },
      body: JSON.stringify({ op: "txn", ...body }),
    });
  } catch (e) { console.error("notify_txn_failed", (e as Error).message); }
}

const periodEnd = (sub: any): string | null => {
  const t = sub?.current_period_end ?? sub?.items?.data?.[0]?.current_period_end;
  return t ? new Date(t * 1000).toISOString() : null;
};

async function grantForOrder(orderId: number, userId: string, productId: string, extra: Record<string, unknown>) {
  const { data: product } = await admin.from("products").select("*").eq("id", productId).single();
  if (!product) throw new Error("unknown product " + productId);
  const rows =
    product.kind === "single" || product.kind === "set"
      ? product.workbook_ids.map((w: string) => ({ user_id: userId, workbook_id: w, source: product.kind, order_id: orderId, ...extra }))
      : [{ user_id: userId, workbook_id: null, source: product.kind === "library" ? "library" : "pass", order_id: orderId, ...extra }];
  const { error } = await admin.from("entitlements").insert(rows);
  if (error) throw error;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const sig = req.headers.get("Stripe-Signature");
  if (!secret || !sig) return new Response("Not configured", { status: 400 });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(await req.text(), sig, secret, undefined, crypto);
  } catch {
    return new Response("Bad signature", { status: 400 });
  }

  // Process each event once
  const { data: fresh } = await admin.from("processed_stripe_events")
    .insert({ event_id: event.id, type: event.type }).select("event_id").maybeSingle();
  if (!fresh) return new Response("Already processed", { status: 200 });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const { user_id, order_id, app_product_id } = s.metadata ?? {};
        if (!user_id || !order_id || !app_product_id) break;
        const orderId = Number(order_id);
        await admin.from("orders").update({
          status: "paid", amount_minor: s.amount_total, currency: s.currency,
          stripe_payment_intent: typeof s.payment_intent === "string" ? s.payment_intent : null,
        }).eq("id", orderId);
        if (s.mode === "subscription" && s.subscription) {
          const sub = await stripe.subscriptions.retrieve(String(s.subscription));
          const { data: subRow } = await admin.from("subscriptions").upsert({
            user_id, stripe_subscription_id: sub.id, product_id: app_product_id,
            status: sub.status, current_period_end: periodEnd(sub),
          }, { onConflict: "stripe_subscription_id" }).select("id").single();
          await grantForOrder(orderId, user_id, app_product_id, { ends_at: periodEnd(sub), subscription_id: subRow?.id });
        } else {
          await grantForOrder(orderId, user_id, app_product_id, {});
        }
        await notifyTxn({ kind: "purchase", user_id, order_id: orderId });
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const active = ["active", "trialing", "past_due"].includes(sub.status) && event.type !== "customer.subscription.deleted";
        const end = active ? periodEnd(sub) : new Date().toISOString();
        const { data: row } = await admin.from("subscriptions").update({
          status: event.type === "customer.subscription.deleted" ? "canceled" : sub.status,
          current_period_end: periodEnd(sub),
          cancel_at: sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString() : null,
        }).eq("stripe_subscription_id", sub.id).select("id").maybeSingle();
        // The reader keeps everything they wrote. Only new content locks when access ends.
        if (row) await admin.from("entitlements").update({ ends_at: end }).eq("subscription_id", row.id);
        if (row && sub.cancel_at && event.type === "customer.subscription.updated") {
          const { data: owner } = await admin.from("subscriptions").select("user_id").eq("id", row.id).single();
          await notifyTxn({ kind: "cancellation", user_id: owner?.user_id, subscription_id: row.id, end_date: new Date(sub.cancel_at * 1000).toISOString() });
        }
        break;
      }
      case "invoice.payment_failed": {
        // Tell the reader once per failed invoice. Access is handled by customer.subscription.updated.
        const inv = event.data.object as any;
        const subId = typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id ?? inv.parent?.subscription_details?.subscription;
        if (!subId) break;
        const { data: row } = await admin.from("subscriptions").select("id,user_id").eq("stripe_subscription_id", String(subId)).maybeSingle();
        if (!row?.user_id) break;
        const due = Number(inv.amount_due ?? 0);
        const amount = due > 0 ? new Intl.NumberFormat("en-US", { style: "currency", currency: String(inv.currency ?? "usd").toUpperCase() }).format(due / 100) : "";
        await notifyTxn({ kind: "payment_failed", user_id: row.user_id, subscription_id: row.id, invoice_id: inv.id, amount });
        break;
      }
      case "charge.refunded": {
        const ch = event.data.object as Stripe.Charge;
        if (typeof ch.payment_intent !== "string") break;
        if (!ch.refunded) { // partial refund: record the amount, keep access (pro rata pass refunds are recorded by /app/account)
          await admin.from("orders").update({ status: "partially_refunded", refunded_minor: ch.amount_refunded })
            .eq("stripe_payment_intent", ch.payment_intent).in("status", ["paid", "partially_refunded"]);
          break;
        }
        const { data: order } = await admin.from("orders").update({ status: "refunded", refunded_minor: ch.amount_refunded })
          .eq("stripe_payment_intent", ch.payment_intent).select("id").maybeSingle();
        if (order) await admin.from("entitlements").update({ ends_at: new Date().toISOString() }).eq("order_id", order.id);
        break;
      }
      case "charge.dispute.created": {
        const d = event.data.object as Stripe.Dispute;
        if (typeof d.payment_intent === "string")
          await admin.from("orders").update({ status: "disputed" }).eq("stripe_payment_intent", d.payment_intent);
        break;
      }
    }
  } catch (e) {
    // Let Stripe retry: forget that we saw this event
    await admin.from("processed_stripe_events").delete().eq("event_id", event.id);
    console.error("webhook_failed", event.type, (e as Error).message);
    return new Response("Processing failed", { status: 500 });
  }
  return new Response("ok", { status: 200 });
});
