import { PAUSE_META_FROM, PAUSE_META_UNTIL, pauseState, type PauseSubject } from "@/lib/membership-pause";
import type { StripeSubscriptionsApi } from "@/lib/membership-cancel";

/**
 * Resume a paused membership (14.25) before the pause ends.
 *
 * A pause that has not started yet is simply taken off: the member carries
 * on as before and the next payment is on the date it always was.
 *
 * A pause that is running has had its invoices voided, so the member has
 * paid for nothing since it began. Resuming moves the billing date to today
 * (billing_cycle_anchor "now", no proration), which takes a full month's
 * payment now and starts a new month from today. Access comes back when that
 * payment clears and the webhook clears the pause window.
 */

export type ResumeOutcome = "resumed" | "ineligible";

export type ResumeSubject = Pick<PauseSubject, "pausedFrom" | "pausedUntil" | "status"> & { stripeSubscriptionId: string };

export function resumeParams(state: ReturnType<typeof pauseState>): Record<string, unknown> | null {
  if (state.kind === "none") return null;
  const cleared = { pause_collection: "", metadata: { [PAUSE_META_FROM]: "", [PAUSE_META_UNTIL]: "" } };
  if (state.kind === "ahead") return cleared;
  return { ...cleared, billing_cycle_anchor: "now", proration_behavior: "none" };
}

export async function runResume(subject: ResumeSubject | null, now: Date, stripe: StripeSubscriptionsApi): Promise<ResumeOutcome> {
  if (!subject || subject.status !== "active") return "ineligible";
  const params = resumeParams(pauseState(subject, now));
  if (!params) return "ineligible";
  await stripe.update(subject.stripeSubscriptionId, params);
  return "resumed";
}
