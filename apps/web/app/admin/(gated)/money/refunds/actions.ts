"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { moneyAbilities } from "@/lib/money/permissions";
import { isTestKey } from "@/lib/money/reconcile";
import { parseRefundForm, reclaimAmount, refundableMinor, REFUND_REASONS, stripeRefundReason } from "@/lib/money/refund";
import { getStaffSession } from "@/lib/staff";
import { getStripe } from "@/lib/stripe";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Refund from the console (F-102). Owner and finance staff only.
 *
 * 1. Work out the Stripe payment and what is left to refund on it.
 * 2. Refund in Stripe, with an idempotency key made of the target and what
 *    had already gone back, so a double submit refunds once.
 * 3. Record it in the ledger (public.record_refund): a refund receipt and,
 *    for a sale, a line reversing the author's share. A full refund of a
 *    single purchase also ends access. The webhook's charge.refunded does
 *    the same on its own, so whichever lands first wins and the other
 *    changes nothing.
 * 4. If asked, and the organisation now owes money because it was already
 *    paid, reclaim the author's share from its last payout with a Stripe
 *    transfer reversal (test mode only) and record that as a
 *    payout_reversal line. Otherwise it comes off the next statement.
 */
export async function refundPayment(fd: FormData): Promise<void> {
  const staff = await getStaffSession("/admin/money/refunds");
  if (!moneyAbilities(staff.roles).refund) redirect("/admin/money/refunds?notice=denied");
  const req = parseRefundForm((k) => fd.get(k));
  const q = typeof fd.get("q") === "string" ? String(fd.get("q")).slice(0, 200) : "";
  const back = (notice: string) => `/admin/money/refunds?notice=${notice}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  if (!req) redirect(back("refund_invalid"));

  const supabase = await createUserClient();
  const stripe = getStripe();
  const livemode = !isTestKey(process.env.STRIPE_SECRET_KEY);

  // 1. The payment.
  let paymentIntent: string | null = null;
  let amount = 0;
  let currency = "GBP";
  let orgId: string | null = null;
  if (req.target === "purchase") {
    const { data, error } = await supabase
      .from("purchases")
      .select("id, kind, status, stripe_payment_intent_id, amount_minor, currency, workbook_id, workbooks(org_id)")
      .eq("id", req.targetId)
      .maybeSingle();
    if (error || !data) redirect(back("invalid"));
    const p = data as unknown as {
      status: string;
      stripe_payment_intent_id: string | null;
      amount_minor: number;
      currency: string;
      workbooks: { org_id: string } | { org_id: string }[] | null;
    };
    if (p.status !== "paid" && p.status !== "refunded") redirect(back("refund_no_payment"));
    paymentIntent = p.stripe_payment_intent_id;
    amount = Number(p.amount_minor);
    currency = p.currency.toUpperCase();
    const wb = Array.isArray(p.workbooks) ? p.workbooks[0] : p.workbooks;
    orgId = wb?.org_id ?? null;
  } else {
    const { data, error } = await supabase
      .from("subscription_invoices")
      .select("id, status, stripe_invoice_id, amount_minor, currency")
      .eq("id", req.targetId)
      .maybeSingle();
    if (error || !data) redirect(back("invalid"));
    const i = data as { status: string; stripe_invoice_id: string; amount_minor: number; currency: string };
    if (i.status !== "paid") redirect(back("refund_no_payment"));
    amount = Number(i.amount_minor);
    currency = i.currency.toUpperCase();
    try {
      const list = await stripe.invoicePayments.list({ invoice: i.stripe_invoice_id, limit: 5 });
      const paid = list.data.find((x) => x.status === "paid" && x.payment?.payment_intent);
      const ref = paid?.payment?.payment_intent;
      paymentIntent = ref ? (typeof ref === "string" ? ref : ref.id) : null;
    } catch {
      paymentIntent = null;
    }
  }
  if (!paymentIntent) redirect(back("refund_no_payment"));

  // What has already gone back, as Stripe sees it.
  let refunded = 0;
  try {
    const list = await stripe.refunds.list({ payment_intent: paymentIntent, limit: 100 });
    refunded = list.data.filter((r) => r.status === "succeeded" || r.status === "pending").reduce((s, r) => s + r.amount, 0);
  } catch {
    redirect(back("refund_stripe"));
  }
  const left = refundableMinor(amount, refunded);
  const toRefund = req.amountMinor ?? left;
  if (toRefund <= 0 || toRefund > left) redirect(back("refund_too_much"));

  // 2. Stripe.
  let refundId: string;
  try {
    const refund = await stripe.refunds.create(
      {
        payment_intent: paymentIntent,
        amount: toRefund,
        reason: stripeRefundReason(req.reason),
        metadata: { akana_reason: req.reason, akana_target: `${req.target}:${req.targetId}`, akana_staff: staff.userId },
      },
      { idempotencyKey: `akana-refund-${req.targetId}-${refunded}-${toRefund}` },
    );
    refundId = refund.id;
  } catch (err) {
    console.error("money_refund_stripe_failed", err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "unknown");
    redirect(back("refund_stripe"));
  }

  // 3. The ledger.
  const { data: recorded, error: recErr } = await supabase.rpc("record_refund", {
    p_kind: "refund",
    p_ref: refundId,
    p_payment_intent: paymentIntent,
    p_amount_minor: toRefund,
    p_currency: currency,
    p_livemode: livemode,
    p_occurred_at: new Date().toISOString(),
    p_reason: REFUND_REASONS[req.reason],
  });
  if (recErr) {
    console.error("money_refund_ledger_failed", recErr.code ?? "");
    redirect(back("refund_ledger"));
  }
  revalidatePath("/admin/money/refunds");
  revalidatePath("/admin/money");
  if (recorded === "no_receipt") redirect(back("refunded_no_receipt"));

  // 4. Reclaim from the last payout, if asked and owed.
  if (req.reclaim && orgId) {
    const outcome = await reclaimFromPayout(supabase, orgId, currency, livemode, refundId, req.reason);
    if (outcome === "failed") redirect(back("reclaim_failed"));
    if (outcome === "reclaimed") redirect(back("refunded_reclaimed"));
  }
  redirect(back("refunded"));
}

type UserClient = Awaited<ReturnType<typeof createUserClient>>;

async function reclaimFromPayout(
  supabase: UserClient,
  orgId: string,
  currency: string,
  livemode: boolean,
  refundId: string,
  reason: string,
): Promise<"reclaimed" | "not_needed" | "failed"> {
  if (!isTestKey(process.env.STRIPE_SECRET_KEY)) return "failed";
  const [lineRes, balRes] = await Promise.all([
    supabase.from("royalty_lines").select("author_minor").eq("idem_key", `refund:${refundId}`).maybeSingle(),
    supabase.from("royalty_balances").select("balance_minor").eq("org_id", orgId).eq("currency", currency).eq("livemode", livemode).maybeSingle(),
  ]);
  if (lineRes.error || balRes.error) return "failed";
  const reversed = -Number((lineRes.data as { author_minor: number } | null)?.author_minor ?? 0);
  const balance = Number((balRes.data as { balance_minor: number } | null)?.balance_minor ?? 0);
  const want = reclaimAmount(reversed, balance);
  if (want <= 0) return "not_needed";

  const { data: payouts, error } = await supabase
    .from("payouts")
    .select("id, amount_minor, reversed_minor, stripe_transfer_id")
    .eq("org_id", orgId)
    .eq("currency", currency)
    .eq("livemode", livemode)
    .eq("status", "paid")
    .order("paid_at", { ascending: false })
    .limit(5);
  if (error) return "failed";
  const p = ((payouts ?? []) as { id: string; amount_minor: number; reversed_minor: number; stripe_transfer_id: string | null }[]).find(
    (x) => x.stripe_transfer_id && Number(x.amount_minor) - Number(x.reversed_minor) > 0,
  );
  if (!p || !p.stripe_transfer_id) return "not_needed";
  const amount = Math.min(want, Number(p.amount_minor) - Number(p.reversed_minor));
  try {
    const trr = await getStripe().transfers.createReversal(
      p.stripe_transfer_id,
      { amount, metadata: { akana_refund: refundId, akana_reason: reason } },
      { idempotencyKey: `akana-trr-${refundId}` },
    );
    const { error: e } = await supabase.rpc("record_transfer_reversal", {
      p_payout: p.id,
      p_reversal: trr.id,
      p_amount_minor: amount,
      p_reason: "Reclaimed after a refund",
    });
    if (e) {
      console.error("money_reclaim_record_failed", e.code ?? "");
      return "failed";
    }
    return "reclaimed";
  } catch (err) {
    console.error("money_reclaim_stripe_failed", err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "unknown");
    return "failed";
  }
}
