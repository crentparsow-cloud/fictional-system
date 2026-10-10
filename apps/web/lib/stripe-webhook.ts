import type Stripe from "stripe";
import { subscriptionStateFrom, type SubscriptionState } from "@/lib/membership";
import { coolingOffOpensAt, inCoolingOff, type CoolingOffCancelResult, type RefundOutcome, type RefundState } from "@/lib/membership-refund";
import type { MembershipPricePointId } from "@/lib/pricing";
import { disputeInfo, type LedgerRepo } from "@/lib/money/ledger";

/**
 * What the Stripe webhook does with an event, as a pure function over a
 * small repository interface so it can be tested with a fake and no
 * network. The route verifies the signature, builds the Supabase-backed
 * repo and calls handleStripeEvent (F-096).
 *
 * Idempotency has two layers. Here, a purchase already marked paid is not
 * granted again and one already refunded is not revoked again. In the
 * database, app.grant_purchase_entitlement and app.revoke_purchase_entitlement
 * are themselves idempotent, so a race between two deliveries still ends
 * with one entitlement and one audit row.
 *
 * Logging is ids only: event id, type, session id, purchase id. Never an
 * email, a name or a title.
 *
 * Membership (F-097) adds customer.subscription.created, .updated and
 * .deleted, invoice.paid and invoice.payment_failed. Each subscription event
 * reads the subscription fresh from Stripe when it can (so delivery order
 * does not matter), upserts public.subscriptions through
 * app.upsert_subscription, and that function brings the membership
 * entitlement into line. Older observations are ignored in SQL, so a
 * repeated or late event changes nothing. Invoices are recorded by id with
 * amounts only. A failed renewal asks the route to send the payment_failed
 * email, which never names a title (F-098).
 *
 * Renewal reminders (UK DMCC Act subscription regime, expected January
 * 2027): invoice.upcoming for an annual membership asks the route to send
 * renewal_notice, with the renewal date, the amount and how to cancel, and
 * never a title. Each reminder carries a dedupe key made of the subscription
 * id and the renewal date. The route's mailer claims that key in
 * public.email_claims (migration 0010) before it sends, so a repeated or
 * replayed event sends nothing new, and releases it if the send fails so a
 * retry can go out. Monthly memberships get the six-monthly
 * membership_terms_reminder from a daily job instead
 * (lib/membership-reminders.ts, migration 0011), not from this webhook.
 *
 * Trial reminders (13.5): customer.subscription.trial_will_end, which Stripe
 * raises three days before a trial ends, asks the route to send
 * trial_reminder with the date of the first payment, the amount and how to
 * cancel, once per subscription and trial end. invoice.upcoming is skipped
 * for a trialing subscription so the first payment is announced once.
 * The first paid invoice of a trial (for nothing) asks for the day-zero
 * email instead of a receipt (14.20).
 *
 * Cooling-off cancel (docs/legal/refund-policy.md section 2): when
 * customer.subscription.updated shows a member asked to cancel (through the
 * portal: cancel_at_period_end turned true, or a cancel_at set) within 14
 * days of the membership starting, the repo ends the subscription now and
 * refunds the unused days pro rata, once per invoice
 * (lib/membership-refund.ts, shared with the deletion job). After 14 days
 * nothing extra happens: it simply stops renewing. A Stripe error throws, so
 * the route answers 500 and Stripe retries; the retry reads the
 * subscription fresh, so nothing is refunded or cancelled twice.
 *
 * Cancellation emails: the cooling-off cancel asks the route to send
 * `cancellation` with cancelMode immediate and the refund, once per
 * subscription. An ordinary cancel at period end (or a cancel_at date) asks
 * for `cancellation` with cancelMode period_end and the end date, once per
 * subscription and end date. Both are claimed in public.email_claims. Only
 * customer.subscription.updated on a subscription that is still running
 * does this. Account deletion cancels in Stripe at once, which arrives as
 * customer.subscription.deleted on an ended subscription, so it never sends
 * a cancellation email: account_deleted already says the membership ended.
 *
 * Royalty ledger (F-100, migration 0021), when the route passes a ledger
 * repo: a paid single purchase writes its receipt and sale line, a paid
 * membership invoice writes its pool receipt, charge.refunded records every
 * refund Stripe holds for the payment (so a console refund and a dashboard
 * refund both land once), and charge.dispute.created and .closed (won)
 * reverse and restore the author's share. All idempotent in SQL.
 *
 * Confirmation emails (0031 mail gaps), returned in outcome.mail for the
 * route to send through lib/purchase-email.ts. None names a title.
 *  - purchase_lifetime when a single purchase is paid, once per purchase
 *    (purchase:<purchase id>).
 *  - purchase_membership on the first paid membership invoice
 *    (billing_reason subscription_create), once per subscription
 *    (purchase_membership:<sub id>). Organisation subscriptions are not
 *    membership plans and send nothing here.
 *  - refund_confirmed on charge.refunded for a single purchase, once per
 *    Stripe refund (refund:<re_ id>), the same key the refund console
 *    claims (0027, lib/support-mail.ts). Whichever claims first sends;
 *    the other is skipped, so a console refund sends one email and a
 *    dashboard refund now sends one too.
 * Each key is claimed in public.email_claims (0010) before the send and
 * released if the send fails.
 */

export type PurchaseStatus = "pending" | "paid" | "refunded" | "failed";

export interface PurchaseRef {
  id: string;
  status: PurchaseStatus;
  /** The buyer, when the repo reads it. Used only to find the sign-in address. */
  userId?: string | null;
}

/** Where a reader email goes: the sign-in address and first name. */
export interface ReaderContact {
  email: string;
  name: string | null;
}

/** One refund Stripe holds for a payment, as the refund email needs it. */
export interface RefundSummary {
  id: string;
  amountMinor: number;
  currency: string;
  status: string | null;
}

export interface GrantDetails {
  paymentIntentId: string | null;
  subscriptionId: string | null;
  amountMinor: number | null;
  taxMinor: number | null;
  currency: string | null;
}

export interface PurchaseRepo {
  findBySessionId(sessionId: string): Promise<PurchaseRef | null>;
  findByPaymentIntentId(paymentIntentId: string): Promise<PurchaseRef | null>;
  /** app.grant_purchase_entitlement */
  grant(purchaseId: string, details: GrantDetails): Promise<void>;
  /** app.revoke_purchase_entitlement */
  revoke(purchaseId: string, reason: string): Promise<void>;
  markFailed(purchaseId: string): Promise<void>;
  /** The reader's sign-in address and name. Optional: without it the address Stripe holds is used. */
  readerContact?(userId: string): Promise<ReaderContact | null>;
  /** Every refund Stripe holds for a payment. Optional: without it no refund email is asked for. */
  listRefunds?(paymentIntentId: string): Promise<RefundSummary[]>;
}

export type WebhookAction =
  | "granted"
  | "already_paid"
  | "awaiting_payment"
  | "marked_failed"
  | "revoked"
  | "already_refunded"
  | "partial_refund_kept"
  | "purchase_not_found"
  | "subscription_applied"
  | "subscription_unchanged"
  | "subscription_stale"
  | "subscription_unlinked"
  | "invoice_recorded"
  | "invoice_unchanged"
  | "invoice_unlinked"
  | "renewal_reminder"
  | "renewal_reminder_not_needed"
  | "renewal_reminder_no_address"
  | "trial_reminder"
  | "trial_reminder_not_needed"
  | "trial_reminder_no_address"
  | "cooling_off_cancelled"
  | "dispute_recorded"
  | "ignored";

export type SubscriptionUpsertResult = "applied" | "unchanged" | "stale" | "unlinked";
export type InvoiceRecordResult = "recorded" | "unchanged" | "unlinked";

export interface InvoiceRecord {
  invoiceId: string;
  subscriptionId: string;
  status: "paid" | "failed";
  currency: string;
  amountMinor: number;
  taxMinor: number;
  billingReason: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  at: string;
}

export interface MembershipRepo {
  /** app.upsert_subscription. Also syncs the membership entitlement. */
  upsertSubscription(state: SubscriptionState): Promise<SubscriptionUpsertResult>;
  /** app.sync_membership_entitlement, for a checkout that completed before any subscription state was readable. */
  syncMembership(userId: string, tenantId: string): Promise<void>;
  /** app.record_subscription_invoice */
  recordInvoice(record: InvoiceRecord): Promise<InvoiceRecordResult>;
  /**
   * The subscription as Stripe has it now, or null when it cannot be read.
   * Optional: without it the event's own copy is used, dated by event.created.
   */
  retrieveSubscription?(subscriptionId: string): Promise<Stripe.Subscription | null>;
  /** The customer's email from Stripe, for an upcoming invoice that does not carry one. Optional. */
  customerEmail?(customerId: string): Promise<string | null>;
  /**
   * End a membership now and refund the unused days, for a cancel asked
   * within 14 days of the start (lib/membership-refund.ts). Optional: without
   * it a portal cancel only stops the renewal. Throws on a Stripe error.
   */
  cancelInCoolingOff?(subscriptionId: string, requestedAt: Date): Promise<CoolingOffCancelResult>;
}

/** An email the route should send. Never carries a title; the template has no title prop (F-098). */
export interface PaymentFailedNotice {
  template: "payment_failed";
  to: string;
  invoiceId: string;
  amountMinor: number | null;
  currency: string | null;
  /** One email per failed invoice. */
  dedupeKey: string;
}

/**
 * Confirms a cancel. Never carries a title. immediate: the cooling-off cancel
 * ended it today, with the refund when one was made. period_end: it stops
 * renewing and access runs to endsAt.
 */
export interface CancellationNotice {
  template: "cancellation";
  to: string;
  subscriptionId: string;
  cancelMode: "immediate" | "period_end";
  /** ISO timestamp access ends, for period_end. */
  endsAt: string | null;
  refundAmountMinor: number | null;
  refundCurrency: string | null;
  refundState: RefundState | null;
  /** cancellation:<sub id>:immediate, or cancellation:<sub id>:period_end:<yyyy-mm-dd>. */
  dedupeKey: string;
}

/** The reminder before an annual renewal. Never carries a title. */
export interface RenewalNotice {
  template: "renewal_notice";
  to: string;
  subscriptionId: string;
  /** ISO timestamp of the renewal. */
  renewsAt: string;
  amountMinor: number | null;
  currency: string | null;
  /** One reminder per subscription and renewal date: renewal_notice:<sub id>:<yyyy-mm-dd>. */
  dedupeKey: string;
}

/**
 * The reminder before a trial converts (13.5). Sent on
 * customer.subscription.trial_will_end, which Stripe raises three days before
 * the trial ends. States the first payment date, the amount and how to
 * cancel. Never carries a title.
 */
export interface TrialReminderNotice {
  template: "trial_reminder";
  to: string;
  subscriptionId: string;
  plan: MembershipPricePointId;
  /** ISO timestamp of the first payment (the trial's end). */
  trialEndsAt: string;
  amountMinor: number | null;
  currency: string | null;
  /** One reminder per subscription and trial end: trial_reminder:<sub id>:<yyyy-mm-dd>. */
  dedupeKey: string;
}

export type MembershipNotice = PaymentFailedNotice | RenewalNotice | CancellationNotice | TrialReminderNotice;

/** Fields every confirmation email carries. Never a title. */
interface ReaderMailBase {
  to: string;
  name: string | null;
  userId: string | null;
  dedupeKey: string;
}

/** A single purchase is paid: purchase_lifetime, once per purchase. */
export interface PurchaseConfirmedNotice extends ReaderMailBase {
  template: "purchase_lifetime";
  purchaseId: string;
  amountMinor: number;
  currency: string;
}

/** The first membership invoice is paid: purchase_membership, once per subscription. */
export interface MembershipConfirmedNotice extends ReaderMailBase {
  template: "purchase_membership";
  /**
   * Set when the membership starts with a trial. The first invoice is then
   * for nothing, so the email is the day-zero email (14.20): the first week's
   * plan and the dates, not a receipt. nextPaymentAt is the trial's end, and
   * amountMinor is 0.
   */
  trial?: boolean;
  subscriptionId: string;
  plan: MembershipPricePointId;
  amountMinor: number;
  currency: string;
  /** ISO timestamp of the next payment. */
  nextPaymentAt: string;
}

/** A refund of a single purchase: refund_confirmed, once per Stripe refund. */
export interface RefundConfirmedNotice extends ReaderMailBase {
  template: "refund_confirmed";
  refundId: string;
  amountMinor: number;
  currency: string;
  accessEnded: boolean;
}

export type ReaderMailNotice = PurchaseConfirmedNotice | MembershipConfirmedNotice | RefundConfirmedNotice;

/** The dedupe keys, in one place so the refund console and the webhook agree. */
export const purchaseMailKey = (purchaseId: string) => `purchase:${purchaseId}`;
export const membershipMailKey = (subscriptionId: string) => `purchase_membership:${subscriptionId}`;
export const refundMailKey = (refundId: string) => `refund:${refundId}`;

export interface WebhookOutcome {
  eventId: string;
  type: string;
  action: WebhookAction;
  purchaseId: string | null;
  /** Set for subscription and invoice events. */
  subscriptionId?: string | null;
  /** Set when the route should send an email. */
  notify?: MembershipNotice;
  /** Confirmation emails the route should send (purchase, membership, refund). */
  mail?: ReaderMailNotice[];
}

export async function handleStripeEvent(
  event: Stripe.Event,
  repo: PurchaseRepo,
  membership?: MembershipRepo,
  ledger?: LedgerRepo,
): Promise<WebhookOutcome> {
  const base = { eventId: event.id, type: event.type };

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object;
      // completed fires for delayed methods before the money arrives; the
      // async_payment_succeeded event follows when it does.
      if (session.payment_status === "unpaid") return { ...base, action: "awaiting_payment", purchaseId: null };
      const purchase = await repo.findBySessionId(session.id);
      if (!purchase) return { ...base, action: "purchase_not_found", purchaseId: null };
      if (purchase.status === "refunded") return { ...base, action: "already_refunded", purchaseId: purchase.id };
      const already = purchase.status === "paid";
      if (!already) await repo.grant(purchase.id, grantDetailsFrom(session));
      // A membership: bring the subscription mirror and the entitlement into
      // line now, so the reader is not waiting on customer.subscription.created.
      if (session.mode === "subscription" && membership) await settleMembershipCheckout(session, event, membership);
      // F-100: the sale's receipt and royalty line. Memberships reach the
      // ledger through invoice.paid instead.
      if (ledger && session.mode === "payment") await ledger.recordSale(purchase.id, idOf(session.payment_intent), event.livemode);
      const outcome: WebhookOutcome = { ...base, action: already ? "already_paid" : "granted", purchaseId: purchase.id };
      // The purchase email. Asked for on a replay too: the claim keeps it to one.
      if (session.mode === "payment") {
        const notice = await purchaseConfirmed(session, purchase, repo);
        if (notice) outcome.mail = [notice];
      }
      return outcome;
    }

    case "checkout.session.async_payment_failed": {
      const session = event.data.object;
      const purchase = await repo.findBySessionId(session.id);
      if (!purchase) return { ...base, action: "purchase_not_found", purchaseId: null };
      if (purchase.status !== "pending") return { ...base, action: "ignored", purchaseId: purchase.id };
      await repo.markFailed(purchase.id);
      return { ...base, action: "marked_failed", purchaseId: purchase.id };
    }

    case "charge.refunded": {
      const charge = event.data.object;
      const pi = idOf(charge.payment_intent);
      if (!pi) return { ...base, action: "purchase_not_found", purchaseId: null };
      // F-100: record every refund on this payment in the ledger first,
      // purchase or membership, whoever started it.
      if (ledger) await ledger.syncRefunds(pi, event.livemode);
      const purchase = await repo.findByPaymentIntentId(pi);
      if (!purchase) return { ...base, action: "purchase_not_found", purchaseId: null };
      // A partial refund (the pro rata promise, F-096) leaves access in place.
      // Only a full refund closes the gate.
      const full = charge.amount_refunded >= charge.amount;
      let action: WebhookAction;
      if (purchase.status === "refunded") action = "already_refunded";
      else if (!full) action = "partial_refund_kept";
      else {
        await repo.revoke(purchase.id, "charge.refunded");
        action = "revoked";
      }
      const outcome: WebhookOutcome = { ...base, action, purchaseId: purchase.id };
      // Even when the purchase was already refunded (the console got there
      // first): the claim on refund:<re_ id> decides who sends.
      const mail = await refundsConfirmed(pi, purchase, full, charge.receipt_email ?? charge.billing_details?.email ?? null, repo);
      if (mail.length) outcome.mail = mail;
      return outcome;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      if (!membership) return { ...base, action: "ignored", purchaseId: null };
      const sub = event.data.object;
      const fresh = await upsertFresh(sub.id, sub, event, membership);
      if (event.type === "customer.subscription.updated" && fresh && membership.cancelInCoolingOff && cancelRequestedInCoolingOff(fresh.sub, event)) {
        const requestedAt = new Date((fresh.sub.canceled_at ?? event.created) * 1000);
        const done = await membership.cancelInCoolingOff(sub.id, requestedAt);
        if (done.status === "cancelled") {
          const outcome: WebhookOutcome = { ...base, action: "cooling_off_cancelled", purchaseId: null, subscriptionId: sub.id };
          const to = await subscriberEmail(fresh.sub, membership);
          if (to) outcome.notify = immediateCancellation(sub.id, to, done.refund);
          return outcome;
        }
      }
      const outcome: WebhookOutcome = { ...base, action: fresh ? `subscription_${fresh.result}` : "ignored", purchaseId: null, subscriptionId: sub.id };
      if (event.type === "customer.subscription.updated" && fresh && cancelAtPeriodEndRequested(fresh.sub)) {
        const to = await subscriberEmail(fresh.sub, membership);
        if (to) outcome.notify = periodEndCancellation(sub.id, to, fresh.state.cancelAt ?? fresh.state.currentPeriodEnd);
      }
      return outcome;
    }

    case "customer.subscription.trial_will_end": {
      if (!membership) return { ...base, action: "ignored", purchaseId: null };
      const sub = event.data.object;
      const fresh = await upsertFresh(sub.id, sub, event, membership);
      const outcome = { ...base, purchaseId: null, subscriptionId: sub.id };
      const state = fresh?.state ?? null;
      // Nothing will be charged if the member has already cancelled or the trial is over.
      if (!fresh || !state || state.status !== "trialing" || state.cancelAtPeriodEnd || state.cancelAt) {
        return { ...outcome, action: "trial_reminder_not_needed" };
      }
      const trialEndsAt = isoOf(fresh.sub.trial_end) ?? state.currentPeriodEnd;
      if (!trialEndsAt || (state.plan !== "member_month" && state.plan !== "member_year")) return { ...outcome, action: "ignored" };
      const to = await subscriberEmail(fresh.sub, membership);
      if (!to) return { ...outcome, action: "trial_reminder_no_address" };
      const price = fresh.sub.items?.data?.[0]?.price;
      return {
        ...outcome,
        action: "trial_reminder",
        notify: {
          template: "trial_reminder",
          to,
          subscriptionId: sub.id,
          plan: state.plan,
          trialEndsAt,
          amountMinor: typeof price?.unit_amount === "number" ? price.unit_amount : null,
          currency: price?.currency ? price.currency.toUpperCase() : null,
          dedupeKey: trialReminderDedupeKey(sub.id, trialEndsAt),
        },
      };
    }

    case "invoice.paid":
    case "invoice.payment_failed": {
      if (!membership) return { ...base, action: "ignored", purchaseId: null };
      const invoice = event.data.object;
      const subscriptionId = invoiceSubscriptionId(invoice);
      if (!subscriptionId || !invoice.id) return { ...base, action: "ignored", purchaseId: null };
      const failed = event.type === "invoice.payment_failed";
      // Refresh the subscription first so the invoice has a row to hang on.
      const fresh = await upsertFresh(subscriptionId, null, event, membership);
      const recorded = await membership.recordInvoice({
        invoiceId: invoice.id,
        subscriptionId,
        status: failed ? "failed" : "paid",
        currency: (invoice.currency ?? "gbp").toUpperCase(),
        amountMinor: failed ? (invoice.amount_due ?? 0) : (invoice.amount_paid ?? 0),
        taxMinor: (invoice.total_taxes ?? []).reduce((sum, t) => sum + (t.amount ?? 0), 0),
        billingReason: invoice.billing_reason ?? null,
        periodStart: isoOf(invoice.period_start),
        periodEnd: isoOf(invoice.period_end),
        at: new Date(event.created * 1000).toISOString(),
      });
      // F-100: membership money waits in the pool month.
      if (ledger && !failed && recorded !== "unlinked") await ledger.recordMembership(invoice.id, event.livemode);
      const outcome: WebhookOutcome = { ...base, action: `invoice_${recorded}`, purchaseId: null, subscriptionId };
      // The membership email, on the first paid invoice only.
      if (!failed && recorded !== "unlinked" && invoice.billing_reason === "subscription_create") {
        const notice = await membershipConfirmed(invoice, subscriptionId, fresh?.state ?? null, repo);
        if (notice) outcome.mail = [notice];
      }
      // One email per failed invoice. The first payment fails on Stripe's own
      // page during checkout, so there is nothing to tell the reader by email.
      if (failed && recorded === "recorded" && invoice.customer_email && invoice.billing_reason !== "subscription_create") {
        outcome.notify = {
          template: "payment_failed",
          to: invoice.customer_email,
          invoiceId: invoice.id,
          amountMinor: invoice.amount_due ?? null,
          currency: invoice.currency ? invoice.currency.toUpperCase() : null,
          dedupeKey: `payment_failed:${invoice.id}`,
        };
      }
      return outcome;
    }

    case "invoice.upcoming": {
      if (!membership) return { ...base, action: "ignored", purchaseId: null };
      const invoice = event.data.object;
      const subscriptionId = invoiceSubscriptionId(invoice);
      if (!subscriptionId) return { ...base, action: "ignored", purchaseId: null };
      const fresh = await upsertFresh(subscriptionId, null, event, membership);
      const state = fresh?.state ?? null;
      const outcome = { ...base, purchaseId: null, subscriptionId };

      const plan = state?.plan ?? planFromInvoiceLines(invoice);
      // Monthly members get the six-monthly terms reminder from the daily
      // job (lib/membership-reminders.ts), not a notice before each renewal.
      if (plan !== "member_year") return { ...outcome, action: "renewal_reminder_not_needed" };
      // Nothing will renew: the reader has already cancelled, or the
      // subscription is not in good standing.
      if (state && (state.cancelAtPeriodEnd || !(state.status === "active" || state.status === "trialing"))) {
        return { ...outcome, action: "renewal_reminder_not_needed" };
      }
      // A trial's reminder comes from customer.subscription.trial_will_end, so
      // the first payment is not announced twice.
      if (state?.status === "trialing") return { ...outcome, action: "renewal_reminder_not_needed" };
      const renewsAt = renewalDateOf(invoice, state);
      if (!renewsAt) return { ...outcome, action: "ignored" };

      const customerId = idOf(invoice.customer as string | { id: string } | null);
      let to = invoice.customer_email ?? null;
      if (!to && customerId && membership.customerEmail) to = await membership.customerEmail(customerId);
      if (!to) return { ...outcome, action: "renewal_reminder_no_address" };

      return {
        ...outcome,
        action: "renewal_reminder",
        notify: {
          template: "renewal_notice",
          to,
          subscriptionId,
          renewsAt,
          amountMinor: typeof invoice.amount_due === "number" ? invoice.amount_due : null,
          currency: invoice.currency ? invoice.currency.toUpperCase() : null,
          dedupeKey: renewalDedupeKey(subscriptionId, renewsAt),
        },
      };
    }

    case "charge.dispute.created":
    case "charge.dispute.closed": {
      if (!ledger) return { ...base, action: "ignored", purchaseId: null };
      const dispute = event.data.object;
      const info = disputeInfo(dispute);
      if (!info) return { ...base, action: "ignored", purchaseId: null };
      if (event.type === "charge.dispute.closed" && dispute.status !== "won") return { ...base, action: "ignored", purchaseId: null };
      await ledger.recordDispute(event.type === "charge.dispute.created" ? "dispute" : "dispute_reversal", info, event.livemode);
      return { ...base, action: "dispute_recorded", purchaseId: null };
    }

    default:
      return { ...base, action: "ignored", purchaseId: null };
  }
}

/**
 * True when a live subscription carries a cancel request made within 14
 * days of the membership starting. The request time is canceled_at, which
 * Stripe sets when the cancel is asked for, else the event's own time.
 */
export function cancelRequestedInCoolingOff(sub: Stripe.Subscription, event: Pick<Stripe.Event, "created">): boolean {
  if (sub.status !== "active" && sub.status !== "trialing") return false;
  if (!sub.cancel_at_period_end && !sub.cancel_at) return false;
  if (typeof sub.start_date !== "number") return false;
  return inCoolingOff(coolingOffOpensAt(sub), new Date((sub.canceled_at ?? event.created) * 1000));
}

/**
 * True when a subscription that is still running is set to stop: cancel at
 * period end, or a cancel_at date. An ended subscription (a cooling-off
 * cancel or account deletion) is false.
 */
export function cancelAtPeriodEndRequested(sub: Pick<Stripe.Subscription, "status" | "cancel_at_period_end" | "cancel_at">): boolean {
  if (sub.status !== "active" && sub.status !== "trialing" && sub.status !== "past_due") return false;
  return Boolean(sub.cancel_at_period_end || sub.cancel_at);
}

/** The cancellation email for a cooling-off cancel, once per subscription. */
export function immediateCancellation(subscriptionId: string, to: string, refund: RefundOutcome): CancellationNotice {
  const made = (refund.status === "refunded" || refund.status === "already_refunded") && typeof refund.amountMinor === "number" && refund.amountMinor > 0;
  return {
    template: "cancellation",
    to,
    subscriptionId,
    cancelMode: "immediate",
    endsAt: null,
    refundAmountMinor: made ? refund.amountMinor! : null,
    refundCurrency: made ? (refund.currency ?? null) : null,
    refundState: made ? (refund.refundState ?? "pending") : null,
    dedupeKey: `cancellation:${subscriptionId}:immediate`,
  };
}

/** The cancellation email for a cancel at period end, once per subscription and end date. */
export function periodEndCancellation(subscriptionId: string, to: string, endsAt: string | null): CancellationNotice {
  return {
    template: "cancellation",
    to,
    subscriptionId,
    cancelMode: "period_end",
    endsAt,
    refundAmountMinor: null,
    refundCurrency: null,
    refundState: null,
    dedupeKey: `cancellation:${subscriptionId}:period_end:${endsAt ? endsAt.slice(0, 10) : "open"}`,
  };
}

/** The sign-in address when the repo can read it, else the one Stripe holds. */
async function contactFor(userId: string | null, fallback: string | null | undefined, repo: PurchaseRepo): Promise<ReaderContact | null> {
  if (userId && repo.readerContact) {
    const c = await repo.readerContact(userId);
    if (c?.email) return c;
  }
  return fallback ? { email: fallback, name: null } : null;
}

/** purchase_lifetime for a paid single purchase, or null when there is no address or amount. */
async function purchaseConfirmed(session: Stripe.Checkout.Session, purchase: PurchaseRef, repo: PurchaseRepo): Promise<PurchaseConfirmedNotice | null> {
  if (typeof session.amount_total !== "number" || !session.currency) return null;
  const meta = (session.metadata ?? {}) as Record<string, string | undefined>;
  const userId = purchase.userId ?? meta.user_id ?? null;
  const who = await contactFor(userId, session.customer_details?.email ?? session.customer_email, repo);
  if (!who) return null;
  return {
    template: "purchase_lifetime",
    to: who.email,
    name: who.name,
    userId,
    purchaseId: purchase.id,
    amountMinor: session.amount_total,
    currency: session.currency.toUpperCase(),
    dedupeKey: purchaseMailKey(purchase.id),
  };
}

/** purchase_membership for the first paid invoice of a reader membership, or null. */
async function membershipConfirmed(
  invoice: Stripe.Invoice,
  subscriptionId: string,
  state: SubscriptionState | null,
  repo: PurchaseRepo,
): Promise<MembershipConfirmedNotice | null> {
  const plan = state?.plan ?? planFromInvoiceLines(invoice);
  if (plan !== "member_month" && plan !== "member_year" && plan !== "member_two_month") return null;
  const nextPaymentAt = state?.currentPeriodEnd ?? isoOf(invoice.lines?.data?.find((l) => l.period?.end)?.period?.end);
  if (!nextPaymentAt || typeof invoice.amount_paid !== "number" || !invoice.currency) return null;
  const userId = state?.userId ?? null;
  const who = await contactFor(userId, invoice.customer_email, repo);
  if (!who) return null;
  return {
    template: "purchase_membership",
    to: who.email,
    name: who.name,
    userId,
    subscriptionId,
    plan,
    amountMinor: invoice.amount_paid,
    currency: invoice.currency.toUpperCase(),
    nextPaymentAt,
    ...(state?.status === "trialing" ? { trial: true } : {}),
    dedupeKey: membershipMailKey(subscriptionId),
  };
}

/** refund_confirmed for every refund on a single purchase's payment that has gone or is going. */
async function refundsConfirmed(
  paymentIntentId: string,
  purchase: PurchaseRef,
  full: boolean,
  fallbackEmail: string | null,
  repo: PurchaseRepo,
): Promise<RefundConfirmedNotice[]> {
  if (!repo.listRefunds) return [];
  const refunds = (await repo.listRefunds(paymentIntentId)).filter((r) => (r.status === "succeeded" || r.status === "pending") && r.amountMinor > 0);
  if (!refunds.length) return [];
  const who = await contactFor(purchase.userId ?? null, fallbackEmail, repo);
  if (!who) return [];
  return refunds.map((r) => ({
    template: "refund_confirmed",
    to: who.email,
    name: who.name,
    userId: purchase.userId ?? null,
    refundId: r.id,
    amountMinor: r.amountMinor,
    currency: r.currency.toUpperCase(),
    accessEnded: full,
    dedupeKey: refundMailKey(r.id),
  }));
}

/** The address to tell: the customer's email from Stripe, when the repo can read it. */
async function subscriberEmail(sub: Stripe.Subscription, membership: MembershipRepo): Promise<string | null> {
  const customer = sub.customer as string | { id: string; email?: string | null; deleted?: boolean } | null;
  if (customer && typeof customer === "object" && !customer.deleted && customer.email) return customer.email;
  const id = idOf(customer);
  return id && membership.customerEmail ? membership.customerEmail(id) : null;
}

/** The dedupe key for one trial reminder: the subscription and the day the trial ends (UTC). */
export function trialReminderDedupeKey(subscriptionId: string, trialEndsAt: string): string {
  return `trial_reminder:${subscriptionId}:${trialEndsAt.slice(0, 10)}`;
}

/** The dedupe key for one renewal reminder: the subscription and the renewal day (UTC). */
export function renewalDedupeKey(subscriptionId: string, renewsAt: string): string {
  return `renewal_notice:${subscriptionId}:${renewsAt.slice(0, 10)}`;
}

/**
 * When the upcoming invoice renews the membership. The subscription's
 * current period end is the renewal; without it, the start of the first
 * line's period, then Stripe's next payment attempt.
 */
function renewalDateOf(invoice: Stripe.Invoice, state: SubscriptionState | null): string | null {
  if (state?.currentPeriodEnd) return state.currentPeriodEnd;
  const line = invoice.lines?.data?.find((l) => l.period?.start);
  return isoOf(line?.period?.start) ?? isoOf(invoice.next_payment_attempt);
}

/** The plan from the length of the first line's period, when the subscription could not be read. */
function planFromInvoiceLines(invoice: Stripe.Invoice): MembershipPricePointId | null {
  const period = invoice.lines?.data?.find((l) => l.period?.start && l.period?.end)?.period;
  if (!period) return null;
  const days = (period.end - period.start) / 86_400;
  if (days >= 300) return "member_year";
  if (days >= 25 && days <= 35) return "member_month";
  return null;
}

/**
 * Read the subscription fresh when the repo can, else use the event's copy
 * dated by event.created. Returns null when there is nothing storable.
 */
async function upsertFresh(
  subscriptionId: string,
  fromEvent: Stripe.Subscription | null,
  event: Stripe.Event,
  membership: MembershipRepo,
  fallbackMeta?: { user_id?: string | null; tenant_id?: string | null } | null,
): Promise<{ result: SubscriptionUpsertResult; state: SubscriptionState; sub: Stripe.Subscription } | null> {
  let sub: Stripe.Subscription | null = null;
  let observedAt = new Date(event.created * 1000);
  if (membership.retrieveSubscription) {
    const fresh = await membership.retrieveSubscription(subscriptionId);
    if (fresh) {
      sub = fresh;
      observedAt = new Date();
    }
  }
  sub ??= fromEvent;
  if (!sub) return null;
  const state = subscriptionStateFrom(sub, observedAt, fallbackMeta);
  if (!state) return null;
  return { result: await membership.upsertSubscription(state), state, sub };
}

async function settleMembershipCheckout(session: Stripe.Checkout.Session, event: Stripe.Event, membership: MembershipRepo): Promise<void> {
  const subscriptionId = idOf(session.subscription);
  const meta = (session.metadata ?? {}) as Record<string, string | undefined>;
  const result = subscriptionId ? await upsertFresh(subscriptionId, null, event, membership, meta) : null;
  if (result === null && meta.user_id && meta.tenant_id) await membership.syncMembership(meta.user_id, meta.tenant_id);
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const details = invoice.parent?.subscription_details;
  return details ? idOf(details.subscription as string | { id: string } | null) : null;
}

function isoOf(seconds: number | null | undefined): string | null {
  return typeof seconds === "number" && Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : null;
}

function grantDetailsFrom(session: Stripe.Checkout.Session): GrantDetails {
  return {
    paymentIntentId: idOf(session.payment_intent),
    subscriptionId: idOf(session.subscription),
    amountMinor: session.amount_total ?? null,
    taxMinor: session.total_details?.amount_tax ?? null,
    currency: session.currency ? session.currency.toUpperCase() : null,
  };
}

function idOf(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}
