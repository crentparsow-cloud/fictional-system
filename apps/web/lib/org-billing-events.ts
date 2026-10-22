import type Stripe from "stripe";
import { invoiceSubscriptionIdOf, orgInvoiceArgs, orgSubscriptionArgs, type OrgInvoiceArgs, type OrgSubscriptionArgs } from "@/lib/org-billing";

/**
 * What the Stripe webhook does with an organisation billing event (F-220,
 * F-222, F-226), as a function over a small repository so it can be tested
 * with a fake. The route (app/api/stripe/webhook) sends an event here when
 * lib/org-billing.ts isOrgBillingEvent says it is one: Stripe metadata
 * akana_kind is org_licence (staff started billing) or org_signup
 * (self-serve Checkout).
 *
 * Every subscription event reads the subscription fresh when it can, so
 * delivery order does not matter, and app.org_billing_apply ignores an
 * older observation. Invoice events refresh the subscription first, then
 * record the invoice; a paid one becomes a pool receipt for the licence's
 * tenant (record_org_licence_receipt), which refuses pilots. Logs carry ids
 * only.
 */

export type ApplyResult = "applied" | "stale" | "unlinked";
export type InvoiceResult = "recorded" | "updated" | "unchanged" | "stale" | "unlinked";

/** The plans self-serve Checkout can start (0030, 0060). */
export const SIGNUP_PLANS = [
  "group_member_month",
  "teams_seat_month",
  "teams_seat_year",
  "small_org_year",
  "church_band_1",
  "church_band_2",
  "church_band_3",
  "church_band_4",
] as const;
export type SignupPlan = (typeof SIGNUP_PLANS)[number];

export function isSignupPlan(v: unknown): v is SignupPlan {
  return typeof v === "string" && (SIGNUP_PLANS as readonly string[]).includes(v);
}

/** A paid six-seat group licence (0060), from Checkout in payment mode. */
export interface OrgPackSale {
  userId: string;
  workbookId: string;
  name: string;
  sessionId: string;
  paymentIntent: string | null;
  amountMinor: number;
  taxMinor: number;
  currency: string;
  livemode: boolean;
  country: string;
}

export interface OrgSignup {
  userId: string;
  plan: SignupPlan;
  orgKind: string;
  name: string;
  country: string;
  billingEmail: string | null;
  subscriptionId: string;
  quantity: number;
}

export interface OrgBillingRepo {
  retrieveSubscription(id: string): Promise<Stripe.Subscription | null>;
  apply(args: OrgSubscriptionArgs): Promise<ApplyResult>;
  recordInvoice(args: OrgInvoiceArgs): Promise<InvoiceResult>;
  /** The paid invoice into the ledger. The repo finds the payment intent and fee. */
  recordReceipt(invoiceId: string, livemode: boolean): Promise<string>;
  /** app.org_self_serve_provision. "closed" when the flag is off. */
  provision(s: OrgSignup): Promise<{ licenceId: string } | "closed">;
  /** app.org_self_serve_seat_organiser (0031): the organiser asked for a seat at sign-up. Null when not given (not 18+ confirmed, no place). */
  seatOrganiser(licenceId: string, userId: string): Promise<string | null>;
  /** app.org_pack_provision (0060): the licence for a paid group licence. "closed" when sign-up is off or the sale cannot stand. */
  provisionPack(s: OrgPackSale): Promise<{ licenceId: string } | "closed">;
}

export type OrgBillingAction =
  | "subscription_applied"
  | "subscription_stale"
  | "subscription_unlinked"
  | "invoice_recorded"
  | "invoice_updated"
  | "invoice_unchanged"
  | "invoice_stale"
  | "invoice_unlinked"
  | "signup_provisioned"
  | "pack_provisioned"
  | "signup_awaiting_payment"
  | "self_serve_closed"
  | "ignored";

export interface OrgBillingOutcome {
  eventId: string;
  type: string;
  action: OrgBillingAction;
  subscriptionId: string | null;
  receipt?: string;
  organiserSeated?: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function idOf(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

async function applyFresh(
  id: string,
  fromEvent: Stripe.Subscription | null,
  event: Stripe.Event,
  repo: OrgBillingRepo,
  licenceId?: string | null,
): Promise<ApplyResult | null> {
  let sub = await repo.retrieveSubscription(id);
  let observed = new Date();
  if (!sub) {
    sub = fromEvent;
    observed = new Date(event.created * 1000);
  }
  if (!sub) return null;
  const args = orgSubscriptionArgs(sub, observed);
  if (!args) return null;
  if (licenceId && !args.p_licence) args.p_licence = licenceId;
  return repo.apply(args);
}

const INVOICE_EVENTS = new Set([
  "invoice.created",
  "invoice.finalized",
  "invoice.sent",
  "invoice.updated",
  "invoice.paid",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "invoice.voided",
  "invoice.marked_uncollectible",
  "invoice.overdue",
]);

export async function handleOrgBillingEvent(event: Stripe.Event, repo: OrgBillingRepo): Promise<OrgBillingOutcome> {
  const base = { eventId: event.id, type: event.type };

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as Stripe.Checkout.Session;
    const packMeta = (session.metadata ?? {}) as Record<string, string | undefined>;
    if (packMeta.akana_kind === "org_pack") {
      if (session.mode !== "payment") return { ...base, action: "ignored", subscriptionId: null };
      if (session.payment_status === "unpaid") return { ...base, action: "signup_awaiting_payment", subscriptionId: null };
      if (!packMeta.user_id || !UUID.test(packMeta.user_id) || !packMeta.workbook_id || !UUID.test(packMeta.workbook_id)) {
        return { ...base, action: "ignored", subscriptionId: null };
      }
      const sold = await repo.provisionPack({
        userId: packMeta.user_id,
        workbookId: packMeta.workbook_id,
        name: packMeta.org_name ?? "",
        sessionId: session.id,
        paymentIntent: idOf(session.payment_intent as string | { id: string } | null),
        amountMinor: Math.max(0, Math.trunc(session.amount_total ?? 0)),
        taxMinor: Math.max(0, Math.trunc(session.total_details?.amount_tax ?? 0)),
        currency: String(session.currency ?? "gbp").toUpperCase(),
        livemode: Boolean(event.livemode),
        country: (session.customer_details?.address?.country ?? "GB").toUpperCase(),
      });
      if (sold === "closed") return { ...base, action: "self_serve_closed", subscriptionId: null };
      return { ...base, action: "pack_provisioned", subscriptionId: null };
    }
    const subscriptionId = idOf(session.subscription as string | { id: string } | null);
    if (session.mode !== "subscription" || !subscriptionId) return { ...base, action: "ignored", subscriptionId: null };
    if (session.payment_status === "unpaid") return { ...base, action: "signup_awaiting_payment", subscriptionId };
    const meta = (session.metadata ?? {}) as Record<string, string | undefined>;
    const quantity = Number(meta.quantity);
    if (
      meta.akana_kind !== "org_signup" ||
      !meta.user_id ||
      !UUID.test(meta.user_id) ||
      !isSignupPlan(meta.plan) ||
      !Number.isInteger(quantity)
    ) {
      return { ...base, action: "ignored", subscriptionId };
    }
    const done = await repo.provision({
      userId: meta.user_id,
      plan: meta.plan,
      orgKind: meta.org_kind ?? "",
      name: meta.org_name ?? "",
      country: (session.customer_details?.address?.country ?? meta.country ?? "GB").toUpperCase(),
      billingEmail: session.customer_details?.email ?? null,
      subscriptionId,
      quantity,
    });
    if (done === "closed") return { ...base, action: "self_serve_closed", subscriptionId };
    await applyFresh(subscriptionId, null, event, repo, done.licenceId);
    // 0031: the tick box at sign-up, off unless ticked. After the mirror, so the seat takes the licence's real dates.
    if (meta.auto_seat === "yes") {
      const seat = await repo.seatOrganiser(done.licenceId, meta.user_id);
      return { ...base, action: "signup_provisioned", subscriptionId, organiserSeated: seat !== null };
    }
    return { ...base, action: "signup_provisioned", subscriptionId };
  }

  if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted"
    || event.type === "customer.subscription.paused" || event.type === "customer.subscription.resumed") {
    const sub = event.data.object as Stripe.Subscription;
    const r = await applyFresh(sub.id, sub, event, repo);
    return { ...base, action: r ? `subscription_${r}` : "ignored", subscriptionId: sub.id };
  }

  if (INVOICE_EVENTS.has(event.type)) {
    const invoice = event.data.object as Stripe.Invoice;
    const subscriptionId = invoiceSubscriptionIdOf(invoice);
    if (!subscriptionId) return { ...base, action: "ignored", subscriptionId: null };
    // The mirror first, so the invoice has a row to hang on.
    await applyFresh(subscriptionId, null, event, repo);
    const args = orgInvoiceArgs(invoice, new Date(event.created * 1000), event.type === "invoice.payment_failed");
    if (!args) return { ...base, action: "ignored", subscriptionId };
    const recorded = await repo.recordInvoice(args);
    const outcome: OrgBillingOutcome = { ...base, action: `invoice_${recorded}`, subscriptionId };
    if (args.p_status === "paid" && args.p_amount_paid > 0 && recorded !== "unlinked" && recorded !== "stale") {
      outcome.receipt = await repo.recordReceipt(args.p_invoice, Boolean(event.livemode));
    }
    return outcome;
  }

  return { ...base, action: "ignored", subscriptionId: null };
}
