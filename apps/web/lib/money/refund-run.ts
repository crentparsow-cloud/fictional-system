import "server-only";
import { isTestKey } from "@/lib/money/reconcile";
import { reclaimAmount, refundableMinor, REFUND_REASONS, stripeRefundReason, type RefundRequest } from "@/lib/money/refund";
import { getStripe } from "@/lib/stripe";
import { sendRefundConfirmation } from "@/lib/support-mail";
import type { createUserClient } from "@/lib/supabase/server";

/**
 * The refund (F-102), shared by the refund console and the account lookup
 * (F-087). The caller has checked the role in the UI; the database checks it
 * again (0021 public.record_refund: owner and finance).
 *
 * 1. Work out the Stripe payment and what is left to refund on it.
 * 2. Refund in Stripe, with an idempotency key made of the target and what
 *    had already gone back, so a double submit refunds once.
 * 3. For a single workbook, email the reader once per refund
 *    (refund_confirmed, keyed on the Stripe refund id). No title.
 * 4. Record it in the ledger (public.record_refund): a refund receipt and,
 *    for a sale, a line reversing the author's share. A full refund of a
 *    single purchase also ends access. The webhook's charge.refunded does
 *    the same on its own, so whichever lands first wins and the other
 *    changes nothing.
 * 5. If asked, and the organisation now owes money because it was already
 *    paid, reclaim the author's share from its last payout with a Stripe
 *    transfer reversal (test mode only) and record that as a
 *    payout_reversal line. Otherwise it comes off the next statement.
 *
 * Returns a fixed notice code for the page; never free text.
 */
export type RefundNotice =
  | "invalid"
  | "refund_no_payment"
  | "refund_stripe"
  | "refund_too_much"
  | "refund_ledger"
  | "refunded_no_receipt"
  | "reclaim_failed"
  | "refunded_reclaimed"
  | "refunded"
  | "refund_not_reader";

type UserClient = Awaited<ReturnType<typeof createUserClient>>;

export async function performRefund(
  supabase: UserClient,
  staffUserId: string,
  req: RefundRequest,
  o: { note?: string | null; expectUserId?: string | null } = {},
): Promise<{ notice: RefundNotice; refundId?: string; emailed?: boolean }> {
  const stripe = getStripe();
  const livemode = !isTestKey(process.env.STRIPE_SECRET_KEY);

  // 1. The payment.
  let paymentIntent: string | null = null;
  let amount = 0;
  let currency = "GBP";
  let orgId: string | null = null;
  let readerId: string | null = null;
  let singleWorkbook = false;
  if (req.target === "purchase") {
    const { data, error } = await supabase
      .from("purchases")
      .select("id, user_id, kind, status, stripe_payment_intent_id, amount_minor, currency, workbook_id, workbooks(org_id)")
      .eq("id", req.targetId)
      .maybeSingle();
    if (error || !data) return { notice: "invalid" };
    const p = data as unknown as {
      user_id: string;
      kind: string;
      status: string;
      stripe_payment_intent_id: string | null;
      amount_minor: number;
      currency: string;
      workbooks: { org_id: string } | { org_id: string }[] | null;
    };
    if (o.expectUserId && p.user_id !== o.expectUserId) return { notice: "refund_not_reader" };
    if (p.status !== "paid" && p.status !== "refunded") return { notice: "refund_no_payment" };
    paymentIntent = p.stripe_payment_intent_id;
    amount = Number(p.amount_minor);
    currency = p.currency.toUpperCase();
    const wb = Array.isArray(p.workbooks) ? p.workbooks[0] : p.workbooks;
    orgId = wb?.org_id ?? null;
    readerId = p.user_id;
    singleWorkbook = p.kind === "workbook";
  } else {
    const { data, error } = await supabase
      .from("subscription_invoices")
      .select("id, status, stripe_invoice_id, amount_minor, currency")
      .eq("id", req.targetId)
      .maybeSingle();
    if (error || !data) return { notice: "invalid" };
    const i = data as { status: string; stripe_invoice_id: string; amount_minor: number; currency: string };
    if (i.status !== "paid") return { notice: "refund_no_payment" };
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
  if (!paymentIntent) return { notice: "refund_no_payment" };

  // What has already gone back, as Stripe sees it.
  let refunded = 0;
  try {
    const list = await stripe.refunds.list({ payment_intent: paymentIntent, limit: 100 });
    refunded = list.data.filter((r) => r.status === "succeeded" || r.status === "pending").reduce((s, r) => s + r.amount, 0);
  } catch {
    return { notice: "refund_stripe" };
  }
  const left = refundableMinor(amount, refunded);
  const toRefund = req.amountMinor ?? left;
  if (toRefund <= 0 || toRefund > left) return { notice: "refund_too_much" };

  // 2. Stripe.
  let refundId: string;
  try {
    const refund = await stripe.refunds.create(
      {
        payment_intent: paymentIntent,
        amount: toRefund,
        reason: stripeRefundReason(req.reason),
        metadata: { akana_reason: req.reason, akana_target: `${req.target}:${req.targetId}`, akana_staff: staffUserId },
      },
      { idempotencyKey: `akana-refund-${req.targetId}-${refunded}-${toRefund}` },
    );
    refundId = refund.id;
  } catch (err) {
    console.error("money_refund_stripe_failed", err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "unknown");
    return { notice: "refund_stripe" };
  }

  // 3. The reader's confirmation, once per refund. Best effort.
  let emailed = false;
  if (singleWorkbook && readerId) {
    const sent = await sendRefundConfirmation({ userId: readerId, refundId, amountMinor: toRefund, currency, accessEnded: toRefund >= left });
    console.info("money_refund_email", sent);
    emailed = sent === "sent" || sent === "sent_test" || sent === "skipped";
  }

  // 4. The ledger.
  const label = REFUND_REASONS[req.reason];
  const note = o.note ? o.note.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 150) : "";
  const { data: recorded, error: recErr } = await supabase.rpc("record_refund", {
    p_kind: "refund",
    p_ref: refundId,
    p_payment_intent: paymentIntent,
    p_amount_minor: toRefund,
    p_currency: currency,
    p_livemode: livemode,
    p_occurred_at: new Date().toISOString(),
    p_reason: note ? `${label}: ${note}` : label,
  });
  if (recErr) {
    console.error("money_refund_ledger_failed", recErr.code ?? "");
    return { notice: "refund_ledger", refundId, emailed };
  }
  if (recorded === "no_receipt") return { notice: "refunded_no_receipt", refundId, emailed };

  // 5. Reclaim from the last payout, if asked and owed.
  if (req.reclaim && orgId) {
    const outcome = await reclaimFromPayout(supabase, orgId, currency, livemode, refundId, req.reason);
    if (outcome === "failed") return { notice: "reclaim_failed", refundId, emailed };
    if (outcome === "reclaimed") return { notice: "refunded_reclaimed", refundId, emailed };
  }
  return { notice: "refunded", refundId, emailed };
}

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
