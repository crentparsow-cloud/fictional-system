// billing: ending a pass, with the refund rule decided on 1 October 2026.
//   Cancelled within 14 days of the pass starting (first paid): it ends at once and the unused
//   time is refunded pro rata. Later: it stops renewing and runs to the end of the paid period.
//   Account deletion always ends the pass at once (same refund rule).
// The Stripe API version is pinned so invoice.payment_intent, invoice.charge and the
// subscription's current_period_* fields have a known shape.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { config } from "./_shared/mailer.ts";

const STRIPE = "https://api.stripe.com/v1";
const STRIPE_VERSION = "2024-06-20";
const DAY = 86400000;

export async function stripe(path: string, opts: { method?: string; params?: Record<string, string>; idem?: string } = {}) {
  const method = opts.method ?? (opts.params ? "POST" : "GET");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${Deno.env.get("STRIPE_SECRET_KEY")}`,
    "Content-Type": "application/x-www-form-urlencoded",
    "Stripe-Version": STRIPE_VERSION,
  };
  if (opts.idem) headers["Idempotency-Key"] = opts.idem;
  const r = await fetch(`${STRIPE}${path}`, { method, headers, body: opts.params ? new URLSearchParams(opts.params) : undefined });
  return { ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) as any };
}

export type Refund = { status: "none" | "pending" | "succeeded" | "failed"; amount_minor: number; currency: string };
export type EndResult = { ok: true; mode: "period_end" | "immediate"; access_until: string; refund: Refund | null }
  | { ok: false; error: string };

export async function refundWindowDays(db: SupabaseClient) {
  const n = Number((await config(db)).refund_window_days);
  return Number.isFinite(n) && n > 0 ? n : 14;
}
export async function refundEligible(db: SupabaseClient, sub: { created_at: string }) {
  const days = await refundWindowDays(db);
  const ends = Date.parse(sub.created_at) + days * DAY;
  return { eligible: Date.now() < ends, window_ends_at: new Date(ends).toISOString() };
}

/** Pro rata: paid x unused whole days / days in the period, rounded down to the cent.
 *  A day that has started counts as used. */
export function proRata(paidMinor: number, periodStart: number, periodEnd: number, now = Date.now()) {
  const periodDays = Math.max(1, Math.round((periodEnd - periodStart) / DAY));
  const usedDays = Math.min(periodDays, Math.max(1, Math.ceil((now - periodStart) / DAY)));
  const unusedDays = periodDays - usedDays;
  return { amount: Math.floor((paidMinor * unusedDays) / periodDays), periodDays, usedDays, unusedDays };
}

const refundState = (s: string | undefined): Refund["status"] =>
  s === "succeeded" ? "succeeded" : s === "pending" || s === "requires_action" ? "pending" : "failed";

async function recordOrderRefund(db: SupabaseClient, userId: string, productId: string, amount: number) {
  const { data: o } = await db.from("orders").select("id,amount_minor,refunded_minor").eq("user_id", userId).eq("product_id", productId)
    .in("status", ["paid", "partially_refunded"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!o) return;
  const total = (o.refunded_minor ?? 0) + amount;
  await db.from("orders").update({ refunded_minor: total, status: o.amount_minor != null && total >= o.amount_minor ? "refunded" : "partially_refunded" }).eq("id", o.id);
}

async function issueRefund(db: SupabaseClient, sub: any, target: string, amount: number, currency: string, attempt = "first"): Promise<Refund> {
  const params: Record<string, string> = { amount: String(amount), reason: "requested_by_customer", "metadata[subscription_row]": String(sub.id), "metadata[rule]": "pro_rata_14_days" };
  params[target.startsWith("ch_") ? "charge" : "payment_intent"] = target;
  const r = await stripe("/refunds", { params, idem: `refund:sub:${sub.id}:${attempt}` });
  const status = r.ok ? refundState(r.body?.status) : "failed";
  await db.from("subscriptions").update({
    refund_status: status, refund_id: r.body?.id ?? null, refund_error: r.ok ? null : String(r.body?.error?.code ?? r.status).slice(0, 120),
  }).eq("id", sub.id);
  if (status !== "failed") await recordOrderRefund(db, sub.user_id, sub.product_id, amount);
  else console.error("refund_failed", sub.id, r.body?.error?.code);
  return { status, amount_minor: amount, currency };
}

/** Ends one pass. reason "cancel": the reader pressed Cancel. reason "account_deleted": always at once. */
export async function endPass(db: SupabaseClient, sub: any, reason: "cancel" | "account_deleted"): Promise<EndResult> {
  const { eligible } = await refundEligible(db, sub);
  const now = new Date().toISOString();

  if (reason === "cancel" && !eligible) {
    const r = await stripe(`/subscriptions/${sub.stripe_subscription_id}`, { params: { cancel_at_period_end: "true" }, idem: `cancel_end:${sub.id}` });
    if (!r.ok) { console.error("stripe_cancel_failed", r.body?.error?.code); return { ok: false, error: "stripe_cancel_failed" }; }
    const end = r.body.cancel_at ? new Date(r.body.cancel_at * 1000).toISOString() : sub.current_period_end;
    await db.from("subscriptions").update({ cancel_at: end, canceled_at: now, cancel_mode: "period_end", refund_status: "none" }).eq("id", sub.id);
    return { ok: true, mode: "period_end", access_until: end, refund: null };
  }

  // Ends at once. Work out the refund before cancelling, while the latest invoice is easy to reach.
  let refund: { amount: number; currency: string; target: string | null } = { amount: 0, currency: "usd", target: null };
  if (eligible) {
    const g = await stripe(`/subscriptions/${sub.stripe_subscription_id}?expand[]=latest_invoice`);
    if (!g.ok) { console.error("stripe_read_failed", g.body?.error?.code); return { ok: false, error: "stripe_read_failed" }; }
    const inv = g.body.latest_invoice ?? {};
    const pi = typeof inv.payment_intent === "string" ? inv.payment_intent : inv.payment_intent?.id;
    const ch = typeof inv.charge === "string" ? inv.charge : inv.charge?.id;
    const start = (g.body.current_period_start ?? inv.period_start) * 1000, end = (g.body.current_period_end ?? inv.period_end) * 1000;
    if (inv.amount_paid > 0 && start && end && (pi || ch)) {
      refund = { amount: proRata(inv.amount_paid, start, end).amount, currency: inv.currency ?? "usd", target: pi ?? ch };
    }
  }
  const d = await stripe(`/subscriptions/${sub.stripe_subscription_id}`, { method: "DELETE", idem: `cancel_now:${sub.id}` });
  if (!d.ok && d.body?.error?.code !== "resource_missing") {
    console.error("stripe_cancel_failed", d.body?.error?.code);
    return { ok: false, error: "stripe_cancel_failed" };
  }
  await db.from("subscriptions").update({
    status: "canceled", cancel_at: now, canceled_at: now, cancel_mode: reason === "cancel" ? "immediate" : "account_deleted",
    refund_minor: refund.amount, refund_currency: refund.currency, refund_target: refund.target,
    refund_status: refund.amount > 0 ? "pending" : "none",
  }).eq("id", sub.id);
  await db.from("entitlements").update({ ends_at: now }).eq("subscription_id", sub.id);  // the webhook does the same
  const r = refund.amount > 0 && refund.target ? await issueRefund(db, sub, refund.target, refund.amount, refund.currency) : null;
  return { ok: true, mode: "immediate", access_until: now, refund: r };
}

/** Hourly: retry refunds that failed. Checks Stripe first, so a refund that did go through is never sent twice. */
export async function retryRefunds(db: SupabaseClient) {
  const { data } = await db.from("subscriptions").select("*").eq("refund_status", "failed").gt("refund_minor", 0).not("refund_target", "is", null).limit(20);
  let retried = 0;
  for (const s of data ?? []) {
    const key = s.refund_target.startsWith("ch_") ? "charge" : "payment_intent";
    const list = await stripe(`/refunds?${key}=${encodeURIComponent(s.refund_target)}&limit=20`);
    const existing = (list.body?.data ?? []).find((x: any) => x?.metadata?.subscription_row === String(s.id) && x.status !== "failed" && x.status !== "canceled");
    if (existing) {
      await db.from("subscriptions").update({ refund_status: refundState(existing.status), refund_id: existing.id, refund_error: null }).eq("id", s.id);
      await recordOrderRefund(db, s.user_id, s.product_id, s.refund_minor);
      continue;
    }
    await issueRefund(db, s, s.refund_target, s.refund_minor, s.refund_currency ?? "usd", new Date().toISOString().slice(0, 13));
    retried++;
  }
  return retried;
}
