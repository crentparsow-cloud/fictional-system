/**
 * Giving the referral reward (6.3 and 13.11), as logic over injected steps so
 * it can be tested without Stripe or a database. lib/referral-stripe.ts wires
 * the real ones.
 *
 * When an invoice for the friend clears with money taken:
 *   1. find the friend's pending referral (none: stop);
 *   2. read the friend's card fingerprint and the referrer's;
 *   3. claim the reward in the database, which applies the guards (same card,
 *      duplicate card, yearly cap) and picks credit or trial days;
 *   4. give it in Stripe with an idempotency key made from the referral id,
 *      so a retried webhook never gives it twice;
 *   5. record that it was given.
 * A referrer still on a trial gets days added to the trial, not credit.
 * Credit lands on the Stripe customer balance and only ever reduces a bill.
 *
 * Retries (0068): the claim stores the trial end it is aiming for, and a
 * retry sets that same date, so the days are never added twice. A disputed
 * first payment earns nothing. When the friend's first payment is fully
 * refunded or disputed, reverseReferralReward takes the reward back once:
 * credit that reached Stripe is debited, credit still waiting is cancelled,
 * and extra trial days come off while the trial is still running.
 */

export interface ClaimedReward {
  referralId: string;
  referrerId: string;
  kind: "credit" | "trial_days";
  value: number;
  currency: string | null;
  /** Unix seconds: the trial end this reward sets. Stored at the claim, so a retry uses the same date. */
  trialEndTarget: number | null;
}

/** The payment that cleared the friend's invoice. */
export interface PaymentInfo {
  /** Card fingerprint, null when it was not a card. */
  fingerprint: string | null;
  paymentIntentId: string | null;
  /** True when the charge already carries a dispute. */
  disputed: boolean;
}

export interface ReferrerState {
  customerId: string | null;
  subscriptionId: string | null;
  /** True when Stripe says the referrer's subscription is trialing right now. */
  trialing: boolean;
  /** Unix seconds when that trial ends. */
  trialEnd: number | null;
}

export interface RewardDeps {
  /** The referrer of a friend with a referral waiting, or null. */
  pendingReferrer(friendId: string): Promise<string | null>;
  paymentInfo(invoiceId: string): Promise<PaymentInfo>;
  referrerState(referrerId: string): Promise<ReferrerState>;
  /** The referrer's card fingerprints in Stripe. */
  customerFingerprints(customerId: string): Promise<string[]>;
  claim(a: {
    friendId: string;
    fingerprint: string | null;
    referrerFingerprints: string[];
    referrerTrialing: boolean;
    referrerTrialEnd: number | null;
    currency: string;
    invoiceId: string;
    paymentIntentId: string | null;
    disputed: boolean;
  }): Promise<ClaimedReward | null>;
  /** Adds credit to the Stripe customer balance. Returns the balance transaction id. */
  addCredit(a: { customerId: string; amountMinor: number; currency: string; key: string }): Promise<string>;
  /** Sets the trial end to an absolute date, so a repeat is harmless. */
  extendTrial(a: { subscriptionId: string; trialEnd: number; key: string }): Promise<void>;
  rewardGiven(referralId: string, balanceTxnId: string | null): Promise<void>;
}

export interface PaidInvoice {
  invoiceId: string;
  friendId: string;
  amountPaidMinor: number;
  currency: string;
}

export type RewardOutcome =
  | "no_payment"
  | "no_referral"
  | "nothing_to_give"
  | "credit_given"
  | "credit_waiting"
  | "trial_extended";

export async function processFirstPayment(inv: PaidInvoice, deps: RewardDeps): Promise<RewardOutcome> {
  // A trial invoice is for nothing: the reward waits for the first payment that takes money.
  if (inv.amountPaidMinor <= 0) return "no_payment";
  const referrerId = await deps.pendingReferrer(inv.friendId);
  if (!referrerId) return "no_referral";

  const [payment, state] = await Promise.all([deps.paymentInfo(inv.invoiceId), deps.referrerState(referrerId)]);
  const referrerFingerprints = state.customerId ? await deps.customerFingerprints(state.customerId) : [];
  const referrerTrialing = state.trialing && state.subscriptionId !== null && state.trialEnd !== null;
  const reward = await deps.claim({
    friendId: inv.friendId,
    fingerprint: payment.fingerprint,
    referrerFingerprints,
    referrerTrialing,
    referrerTrialEnd: referrerTrialing ? state.trialEnd : null,
    currency: inv.currency.toUpperCase(),
    invoiceId: inv.invoiceId,
    paymentIntentId: payment.paymentIntentId,
    disputed: payment.disputed,
  });
  if (!reward) return "nothing_to_give";

  const key = `referral:${reward.referralId}`;
  if (reward.kind === "trial_days") {
    // The claim was made while the referrer was trialing. If the trial has ended since, the days have nowhere to go.
    if (!state.subscriptionId) throw new Error("referral_trial_target_missing");
    // The stored target wins: on a retry Stripe's trial end already includes the days.
    const target = reward.trialEndTarget ?? (state.trialEnd !== null ? extendedTrialEnd(state.trialEnd, reward.value) : null);
    if (target === null) throw new Error("referral_trial_target_missing");
    await deps.extendTrial({ subscriptionId: state.subscriptionId, trialEnd: target, key });
    await deps.rewardGiven(reward.referralId, null);
    return "trial_extended";
  }
  if (!state.customerId) {
    // No Stripe customer yet: the credit is recorded and lands when they have one.
    await deps.rewardGiven(reward.referralId, null);
    return "credit_waiting";
  }
  const txn = await deps.addCredit({ customerId: state.customerId, amountMinor: reward.value, currency: reward.currency ?? inv.currency, key });
  await deps.rewardGiven(reward.referralId, txn);
  return "credit_given";
}

export interface PendingCredit {
  id: string;
  amountMinor: number;
  currency: string;
}

/** Credit recorded before the referrer had a Stripe customer: put it on the balance now. Returns how many landed. */
export async function applyPendingCredits(
  customerId: string,
  credits: readonly PendingCredit[],
  deps: { addCredit: RewardDeps["addCredit"]; creditApplied(creditId: string, balanceTxnId: string): Promise<void> },
): Promise<number> {
  let n = 0;
  for (const c of credits) {
    const txn = await deps.addCredit({ customerId, amountMinor: c.amountMinor, currency: c.currency, key: `credit:${c.id}` });
    await deps.creditApplied(c.id, txn);
    n += 1;
  }
  return n;
}

const DAY = 86_400;
/** The new trial end, in unix seconds, after adding days. */
export function extendedTrialEnd(currentTrialEnd: number, days: number): number {
  return currentTrialEnd + days * DAY;
}

/** What the database says is left to undo (public.referral_reverse, 0068). */
export interface ReversalRow {
  referralId: string;
  referrerId: string;
  action: "debit" | "shorten_trial";
  value: number;
  currency: string | null;
  trialEndTarget: number | null;
}

export interface ReversalDeps {
  reverse(paymentIntentId: string, reason: "refunded" | "disputed"): Promise<ReversalRow | null>;
  referrerState(referrerId: string): Promise<ReferrerState>;
  /** Takes credit back off the Stripe customer balance. Returns the balance transaction id. */
  debitCredit(a: { customerId: string; amountMinor: number; currency: string; key: string }): Promise<string>;
  setTrialEnd(a: { subscriptionId: string; trialEnd: number | "now"; key: string }): Promise<void>;
  reversed(referralId: string, balanceTxnId: string | null): Promise<void>;
}

export type ReversalOutcome = "nothing_to_reverse" | "credit_taken_back" | "trial_shortened" | "trial_already_billed";

/**
 * The friend's first payment was fully refunded or disputed. Idempotent: the
 * database hands back the same row until reversed() is recorded, and every
 * Stripe write carries a key made from the referral.
 */
export async function reverseReferralReward(
  paymentIntentId: string,
  reason: "refunded" | "disputed",
  deps: ReversalDeps,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<ReversalOutcome> {
  const row = await deps.reverse(paymentIntentId, reason);
  if (!row) return "nothing_to_reverse";
  const key = `referral-reversal:${row.referralId}`;
  const state = await deps.referrerState(row.referrerId);
  if (row.action === "debit") {
    if (!state.customerId) throw new Error("referral_reversal_customer_missing");
    const txn = await deps.debitCredit({ customerId: state.customerId, amountMinor: row.value, currency: row.currency ?? "GBP", key });
    await deps.reversed(row.referralId, txn);
    return "credit_taken_back";
  }
  // Trial days: only while the trial is still running. Once billed, the days were used.
  if (!state.trialing || !state.subscriptionId || state.trialEnd === null) {
    await deps.reversed(row.referralId, null);
    return "trial_already_billed";
  }
  const target = row.trialEndTarget ?? state.trialEnd;
  const original = target - row.value * DAY;
  if (state.trialEnd > original) {
    await deps.setTrialEnd({ subscriptionId: state.subscriptionId, trialEnd: original > nowSeconds + 60 ? original : "now", key });
  }
  await deps.reversed(row.referralId, null);
  return "trial_shortened";
}
