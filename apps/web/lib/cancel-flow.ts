import type { SharedOffer } from "@/lib/shared-membership";
import { PAUSE_MONTHS, canPause, pauseRefusal, pauseState, type PauseMonths, type PauseSubject } from "@/lib/membership-pause";

/**
 * The cancellation flow (14.24) as pure data and decisions.
 *
 * One screen at /you/membership/cancel. One optional reason. One offer, which
 * is the shared plan or a pause, never both. Then a Cancel button that says
 * what it does. Nothing here asks "are you sure", nothing counts down, and
 * nothing is compulsory: the reason can be left empty and the Cancel button
 * works without it.
 *
 * Under the UK DMCC Act subscription rules a member must be able to end the
 * contract with a clear statement in the way they choose, and must get a
 * confirmation within 24 hours. Cancel on this screen, a cancel in Stripe's
 * portal and a written request to support all end up in the same place: the
 * Stripe subscription is set to end, the webhook runs the 14-day refund if it
 * applies, and the cancellation email goes out at once.
 */

// ---------------------------------------------------------------------------
// The optional reason. The values are Stripe's own cancellation feedback
// codes, so the answer lands in Stripe's cancellation_details and nowhere
// else. There is no free text: a box for it invites things we do not want.
// ---------------------------------------------------------------------------

export const CANCEL_REASONS = [
  { value: "too_expensive", label: "It costs more than I want to spend" },
  { value: "unused", label: "I am not using it enough" },
  { value: "missing_features", label: "It does not have what I need" },
  { value: "switched_service", label: "I am using something else" },
  { value: "other", label: "Something else" },
] as const;

export type CancelReason = (typeof CANCEL_REASONS)[number]["value"];

export function parseCancelReason(raw: unknown): CancelReason | null {
  return CANCEL_REASONS.find((r) => r.value === raw)?.value ?? null;
}

// ---------------------------------------------------------------------------
// Who may cancel here, and what the screen shows
// ---------------------------------------------------------------------------

export interface CancelSubject extends PauseSubject {
  stripeSubscriptionId: string;
}

export type CancelView =
  /** No membership of their own. */
  | { kind: "none" }
  /** Already set to end. Shows the end date and nothing to do. */
  | { kind: "ending"; endsOn: string | null }
  /** Has a membership to cancel. */
  | { kind: "cancellable"; plan: "monthly" | "yearly" | "two_monthly" | null; pausable: boolean; pauseRunning: boolean; trialing: boolean; periodEnd: string | null };

const LIVE = new Set(["active", "trialing", "past_due"]);

/** The subscription to act on: the most recently updated live one. */
export function pickSubject<T extends CancelSubject & { updatedAt?: string | null }>(rows: readonly T[] | null | undefined): T | null {
  const live = (rows ?? []).filter((r) => LIVE.has(r.status));
  live.sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));
  return live[0] ?? null;
}

export function cancelView(sub: CancelSubject | null, now: Date): CancelView {
  if (!sub) return { kind: "none" };
  if (sub.cancelAtPeriodEnd || sub.cancelAt) return { kind: "ending", endsOn: sub.cancelAt ?? sub.currentPeriodEnd };
  const plan = sub.plan === "member_month" ? "monthly" : sub.plan === "member_year" ? "yearly" : sub.plan === "member_two_month" ? "two_monthly" : null;
  return {
    kind: "cancellable",
    plan,
    pausable: canPause(sub, now),
    pauseRunning: pauseState(sub, now).kind === "running",
    trialing: sub.status === "trialing",
    periodEnd: sub.currentPeriodEnd,
  };
}

// ---------------------------------------------------------------------------
// The one offer
// ---------------------------------------------------------------------------

export type Offer = { kind: "shared"; offer: SharedOffer } | { kind: "pause"; months: readonly PauseMonths[] } | { kind: "none" };

/**
 * Exactly one offer, or none. A member who says cost is the reason, and who
 * is not already sharing, sees the shared plan when it can be bought.
 * Everyone else who can pause sees a pause. A member who cannot pause and
 * has no shared plan to be offered sees no offer, only the Cancel button.
 * `reason` null (nothing chosen) counts as not cost.
 */
export function chooseOffer(input: { reason: CancelReason | null; view: CancelView; sharedOffer: SharedOffer | null }): Offer {
  if (input.view.kind !== "cancellable") return { kind: "none" };
  const single = input.view.plan !== "two_monthly";
  const shared = single ? input.sharedOffer : null;
  if (input.reason === "too_expensive" && shared) return { kind: "shared", offer: shared };
  if (input.view.pausable) return { kind: "pause", months: PAUSE_MONTHS };
  if (shared) return { kind: "shared", offer: shared };
  return { kind: "none" };
}

// ---------------------------------------------------------------------------
// The state machine. Four steps, one of which is open. Once a flow has
// finished, nothing else changes it, so a double submit does nothing twice.
// ---------------------------------------------------------------------------

export type CancelState =
  | { step: "choose" }
  | { step: "cancelled"; reason: CancelReason | null }
  | { step: "paused"; months: PauseMonths }
  | { step: "stayed" };

export type CancelEvent =
  | { type: "cancel"; reason: CancelReason | null }
  | { type: "pause"; months: PauseMonths }
  | { type: "stay" };

export const CANCEL_START: CancelState = { step: "choose" };

export function cancelStep(state: CancelState, event: CancelEvent, view: CancelView): CancelState {
  if (state.step !== "choose") return state;
  if (view.kind !== "cancellable") return state;
  switch (event.type) {
    case "cancel":
      return { step: "cancelled", reason: event.reason };
    case "pause":
      return view.pausable ? { step: "paused", months: event.months } : state;
    case "stay":
      return { step: "stayed" };
  }
}

/** What a form submit means. `intent` is the value of the button that was pressed. */
export function parseCancelForm(get: (k: string) => unknown): CancelEvent | null {
  const intent = get("intent");
  if (intent === "cancel") return { type: "cancel", reason: parseCancelReason(get("reason")) };
  if (intent === "stay") return { type: "stay" };
  if (typeof intent === "string" && intent.startsWith("pause-")) {
    const m = Number(intent.slice("pause-".length));
    return m === 1 || m === 2 || m === 3 ? { type: "pause", months: m } : null;
  }
  return null;
}

/** Why a pause was refused, in words, for the screen. */
export function pauseRefusalWords(sub: PauseSubject, now: Date): string | null {
  switch (pauseRefusal(sub, now)) {
    case null:
      return null;
    case "yearly":
      return "A pause is for monthly memberships. Your membership renews once a year.";
    case "already_paused":
      return "Your membership is already paused.";
    case "trial":
      return "You are in your trial. Cancel before it ends and you are not charged.";
    case "ending":
      return "Your membership is already set to end.";
    default:
      return "A pause is not available for this membership right now.";
  }
}

// ---------------------------------------------------------------------------
// Words. Plain, no apology, no guilt, nothing about what they will miss.
// ---------------------------------------------------------------------------

export const CANCEL_COPY = {
  title: "Cancel your membership",
  lead: "This takes one screen. You do not have to give a reason.",
  reasonLegend: "Why are you cancelling? (optional)",
  cancelButton: "Cancel membership",
  stayButton: "Keep my membership",
  afterCancel: "Your answers stay yours. You can still read everything you wrote, and download it from the You page.",
} as const;

/** What happens to access when they press Cancel. */
export function cancelConsequence(view: Extract<CancelView, { kind: "cancellable" }>, inCoolingOff: boolean, formatDate: (iso: string) => string): string {
  if (view.pauseRunning) return "Your membership is paused, so it ends today. Nothing more is charged.";
  if (view.trialing) return "You are in your trial, so you will not be charged. Your access ends when the trial ends.";
  if (inCoolingOff) {
    return "You started less than 14 days ago, so your membership ends today and you are refunded for the days you have not used. The email we send says how much.";
  }
  const end = view.periodEnd ? formatDate(view.periodEnd) : "the end of the period you have paid for";
  return `Your access carries on until ${end}. After that nothing more is charged.`;
}
