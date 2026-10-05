// create-checkout: starts a Stripe Checkout session for a signed-in reader.
// Records the reader's checkout consents (immediate access, and auto-renewal for passes)
// before sending them to Stripe. Receipts name the offer, never the workbook topic.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) return json({ error: "Payments are not configured yet" }, 500);
  const appUrl = Deno.env.get("APP_URL") ?? "https://example.invalid";

  // Who is asking
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Please sign in first" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let body: { product_id?: string; immediate_access?: boolean; auto_renewal?: boolean };
  try { body = await req.json(); } catch { return json({ error: "Invalid request" }, 400); }

  const { data: product } = await admin.from("products").select("*").eq("id", body.product_id ?? "").eq("active", true).single();
  if (!product || !product.stripe_price_id) return json({ error: "That offer is not available" }, 404);

  // No new purchases while the account is scheduled for deletion (billing was stopped on request).
  const { data: pending } = await admin.rpc("deletion_pending", { p_user: user.id });
  if (pending) return json({ error: "account_deletion_scheduled", message: "Your account is scheduled for deletion. Undo the deletion in Settings first." }, 409);

  const { data: stored } = await admin.rpc("has_consent", { p_user: user.id, p_type: "store" });
  if (!stored) return json({ error: "Storage consent is required before buying" }, 403);

  const isPass = product.kind === "pass_monthly" || product.kind === "pass_annual";
  if (!body.immediate_access) return json({ error: "Please confirm the immediate access box" }, 400);
  if (isPass && !body.auto_renewal) return json({ error: "Please confirm the renewal box" }, 400);

  const immediateVersion = isPass ? "immediate_access_pass_v1" : "immediate_access_lifetime_v1";
  const consentRows = [{ user_id: user.id, consent_type: "immediate_access", version_id: immediateVersion, granted: true }];
  if (isPass) consentRows.push({ user_id: user.id, consent_type: "auto_renewal", version_id: "auto_renewal_v1", granted: true });
  const { error: consentErr } = await admin.from("consents").insert(consentRows);
  if (consentErr) return json({ error: "Could not record consent" }, 500);

  const { data: order, error: orderErr } = await admin.from("orders").insert({
    user_id: user.id, product_id: product.id, status: "pending", workbook_ids: product.workbook_ids,
    immediate_access_consent: immediateVersion, renewal_consent: isPass ? "auto_renewal_v1" : null,
  }).select("id").single();
  if (orderErr || !order) return json({ error: "Could not start the order" }, 500);

  const p = new URLSearchParams();
  p.set("mode", isPass ? "subscription" : "payment");
  p.set("line_items[0][price]", product.stripe_price_id);
  p.set("line_items[0][quantity]", "1");
  p.set("success_url", `${appUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
  p.set("cancel_url", `${appUrl}/?checkout=cancelled`);
  p.set("client_reference_id", user.id);
  if (user.email) p.set("customer_email", user.email);
  // Internal data only. The workbook id never appears on the receipt or statement.
  for (const [k, v] of Object.entries({ user_id: user.id, order_id: String(order.id), app_product_id: product.id })) {
    p.set(`metadata[${k}]`, v);
    if (isPass) p.set(`subscription_data[metadata][${k}]`, v);
    else p.set(`payment_intent_data[metadata][${k}]`, v);
  }

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: p,
  });
  const session = await res.json();
  if (!res.ok) {
    console.error("stripe_error", session?.error?.type, session?.error?.code);
    return json({ error: "Checkout could not start. Please try again." }, 502);
  }
  await admin.from("orders").update({ stripe_checkout_id: session.id }).eq("id", order.id);
  return json({ url: session.url });
});
