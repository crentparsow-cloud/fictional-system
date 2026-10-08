import "server-only";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { handleOrgBillingEvent, type OrgBillingRepo } from "@/lib/org-billing-events";
import { reportOps } from "@/lib/ops-alerts";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export { isOrgBillingEvent } from "@/lib/org-billing";

/**
 * Organisation billing from the platform webhook (F-220, F-222, F-226).
 * app/api/stripe/webhook/route.ts verifies the signature and hands an
 * event here when isOrgBillingEvent says it is one, before the reader
 * membership code sees it. Refunds and disputes stay on the existing path:
 * the ledger finds the organisation's receipt by its payment intent.
 *
 * 200 once handled, 500 on a database or Stripe error so Stripe retries.
 * Logs carry ids only.
 */
export async function handleOrgBillingWebhook(event: Stripe.Event): Promise<NextResponse> {
  try {
    const admin = createAdminClient();
    const outcome = await handleOrgBillingEvent(event, orgBillingRepo(admin, getStripe()));
    console.info("stripe webhook org billing", outcome);
    return NextResponse.json({ received: true, action: outcome.action });
  } catch (err) {
    console.error("stripe webhook org billing failed", { event: event.id, type: event.type, reason: err instanceof Error ? err.message : "unknown" });
    try {
      await reportOps(createAdminClient(), "webhook_failure", "api/stripe/webhook", "org_billing_failed");
    } catch {
      console.error("stripe webhook org billing: ops report unavailable");
    }
    return NextResponse.json({ error: "handler_failed" }, { status: 500 });
  }
}

type Admin = ReturnType<typeof createAdminClient>;

/** The repository over the service role client and the Stripe client. */
export function orgBillingRepo(admin: Admin, stripe: Stripe): OrgBillingRepo {
  async function paymentIntentOf(invoiceId: string): Promise<string | null> {
    try {
      const list = await stripe.invoicePayments.list({ invoice: invoiceId, limit: 5 });
      for (const p of list.data) {
        if (p.status !== "paid") continue;
        const ref = p.payment?.payment_intent;
        if (ref) return typeof ref === "string" ? ref : ref.id;
      }
    } catch {
      // paid out of band (bank transfer marked paid), or Stripe unreadable now
    }
    return null;
  }
  async function feeOf(pi: string): Promise<{ fee: number; txn: string } | null> {
    try {
      const intent = await stripe.paymentIntents.retrieve(pi, { expand: ["latest_charge.balance_transaction"] });
      const charge = intent.latest_charge && typeof intent.latest_charge === "object" ? intent.latest_charge : null;
      const txn = charge && charge.balance_transaction && typeof charge.balance_transaction === "object" ? charge.balance_transaction : null;
      return txn && txn.currency === intent.currency ? { fee: txn.fee, txn: txn.id } : null;
    } catch {
      return null;
    }
  }

  return {
    async retrieveSubscription(id) {
      try {
        return await stripe.subscriptions.retrieve(id);
      } catch {
        return null;
      }
    },
    async apply(args) {
      const { data, error } = await admin.rpc("org_billing_apply", { ...args });
      if (error) throw new Error(`org_billing_apply failed: ${error.code ?? "unknown"}`);
      return data as "applied" | "stale" | "unlinked";
    },
    async recordInvoice(args) {
      const { data, error } = await admin.rpc("org_billing_record_invoice", { ...args });
      if (error) throw new Error(`org_billing_record_invoice failed: ${error.code ?? "unknown"}`);
      return data as "recorded" | "updated" | "unchanged" | "stale" | "unlinked";
    },
    async recordReceipt(invoiceId, livemode) {
      const pi = await paymentIntentOf(invoiceId);
      const fee = pi ? await feeOf(pi) : null;
      const { data, error } = await admin.rpc("record_org_licence_receipt", {
        p_invoice: invoiceId,
        p_livemode: livemode,
        p_payment_intent: pi,
        p_balance_txn: fee?.txn ?? null,
        p_fee_minor: fee?.fee ?? null,
      });
      if (error) throw new Error(`record_org_licence_receipt failed: ${error.code ?? "unknown"}`);
      return String(data);
    },
    async provision(s) {
      const { data, error } = await admin.rpc("org_self_serve_provision", {
        p_user: s.userId,
        p_plan: s.plan,
        p_org_kind: s.orgKind,
        p_name: s.name,
        p_country: s.country,
        p_billing_email: s.billingEmail,
        p_subscription: s.subscriptionId,
        p_quantity: s.quantity,
      });
      // Flag off, a field the checkout route should have caught, or an account
      // set for deletion: retrying will not help. Logged; staff refund it.
      if (error?.code === "AKO13" || error?.code === "AKO02" || error?.code === "AKO06") {
        console.error("org_self_serve_refused", { code: error.code, subscription: s.subscriptionId });
        return "closed";
      }
      if (error) throw new Error(`org_self_serve_provision failed: ${error.code ?? "unknown"}`);
      return { licenceId: String(data) };
    },
  };
}
