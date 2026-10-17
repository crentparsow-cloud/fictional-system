import { CANCEL_START, cancelStep, cancelView, type CancelEvent, type CancelReason, type CancelSubject } from "@/lib/cancel-flow";
import { PAUSE_META_FROM, PAUSE_META_UNTIL, pauseState, pauseWindow, type PauseMonths } from "@/lib/membership-pause";

/**
 * Runs a cancel-flow event against Stripe (14.24, 14.25). The Stripe client
 * and the mailer come in as small interfaces, so the whole thing is tested
 * with fakes and no network. The server action wires the real ones.
 *
 * What each outcome does:
 *  - cancelled      The subscription is set to end at the period end. The
 *                   webhook sees customer.subscription.updated, runs the
 *                   14-day refund if it applies, and sends the cancellation
 *                   email at once. A pause that had not started is removed.
 *  - cancelled_now  The membership was paused, so there is nothing left to
 *                   run to the end of: it ends today. No refund applies
 *                   because nothing was charged. The email goes from here,
 *                   because the webhook does not send one for an ended
 *                   subscription.
 *  - paused         pause_collection is set from the end of the paid period.
 *                   The email goes from here.
 *  - stayed         Nothing changes.
 *  - ineligible     The state did not allow it (already ending, no
 *                   membership). Nothing changes.
 */

export interface StripeSubscriptionsApi {
  update(id: string, params: Record<string, unknown>): Promise<unknown>;
  cancel(id: string, params: Record<string, unknown>): Promise<unknown>;
}

export interface CancelMailApi {
  paused(a: { subscriptionId: string; months: PauseMonths; from: Date; until: Date; plan: string | null }): Promise<unknown>;
  endedNow(a: { subscriptionId: string }): Promise<unknown>;
}

export type CancelOutcome = "cancelled" | "cancelled_now" | "paused" | "stayed" | "ineligible";

const unix = (d: Date) => Math.floor(d.getTime() / 1000);

function feedback(reason: CancelReason | null): Record<string, unknown> {
  return reason ? { cancellation_details: { feedback: reason } } : {};
}

export async function runCancelEvent(
  event: CancelEvent,
  subject: CancelSubject | null,
  now: Date,
  stripe: StripeSubscriptionsApi,
  mail: CancelMailApi,
): Promise<CancelOutcome> {
  const view = cancelView(subject, now);
  if (!subject || view.kind !== "cancellable") return "ineligible";
  const next = cancelStep(CANCEL_START, event, view);
  const id = subject.stripeSubscriptionId;

  switch (next.step) {
    case "choose":
      return "ineligible";
    case "stayed":
      return "stayed";
    case "cancelled": {
      const pause = pauseState(subject, now);
      if (pause.kind === "running") {
        await stripe.cancel(id, feedback(next.reason));
        await mail.endedNow({ subscriptionId: id });
        return "cancelled_now";
      }
      await stripe.update(id, {
        cancel_at_period_end: true,
        ...feedback(next.reason),
        // A pause that had not started yet goes with the cancel.
        ...(pause.kind === "ahead" ? { pause_collection: "", metadata: { [PAUSE_META_FROM]: "", [PAUSE_META_UNTIL]: "" } } : {}),
      });
      return "cancelled";
    }
    case "paused": {
      const periodEnd = subject.currentPeriodEnd ? new Date(subject.currentPeriodEnd) : null;
      if (!periodEnd) return "ineligible";
      const w = pauseWindow(periodEnd, next.months);
      await stripe.update(id, {
        pause_collection: { behavior: "void", resumes_at: unix(w.stripeResumesAt) },
        metadata: { [PAUSE_META_FROM]: w.from.toISOString(), [PAUSE_META_UNTIL]: w.until.toISOString() },
      });
      await mail.paused({ subscriptionId: id, months: w.months, from: w.from, until: w.until, plan: subject.plan });
      return "paused";
    }
  }
}

// ---------------------------------------------------------------------------
// Staff cancel (support inbox route). Any clear written statement counts as
// notice of cancellation, so support cancels from the account lookup in one
// click. Same effect as the reader pressing Cancel, with no reason given.
// ---------------------------------------------------------------------------

export interface StaffCancelTarget {
  subscription: string;
  pausedFrom: string | null;
  pausedUntil: string | null;
}

export async function runStaffCancel(target: StaffCancelTarget, now: Date, stripe: StripeSubscriptionsApi, mail: CancelMailApi): Promise<"cancelled" | "cancelled_now"> {
  const pause = pauseState({ pausedFrom: target.pausedFrom, pausedUntil: target.pausedUntil }, now);
  if (pause.kind === "running") {
    await stripe.cancel(target.subscription, { cancellation_details: { comment: "Cancelled by support at the reader's written request." } });
    await mail.endedNow({ subscriptionId: target.subscription });
    return "cancelled_now";
  }
  await stripe.update(target.subscription, {
    cancel_at_period_end: true,
    cancellation_details: { comment: "Cancelled by support at the reader's written request." },
    ...(pause.kind === "ahead" ? { pause_collection: "", metadata: { [PAUSE_META_FROM]: "", [PAUSE_META_UNTIL]: "" } } : {}),
  });
  return "cancelled";
}
