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
 */

export interface ClaimedReward {
  referralId: string;
  referrerId: string;
  kind: "credit" | "trial_days";
  value: number;
  currency: string | null;
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
  /** Card fingerprint of the payment that cleared, null when it was not a card. */
  paymentFingerprint(invoiceId: string): Promise<string | null>;
  referrerState(referrerId: string): Promise<ReferrerState>;
  /** The referrer's card fingerprints in Stripe. */
  customerFingerprints(customerId: string): Promise<string[]>;
  claim(a: { friendId: string; fingerprint: string | null; referrerFingerprints: string[]; referrerTrialing: boolean; currency: string }): Promise<ClaimedReward | null>;
  /** Adds credit to the Stripe customer balance. Returns the balance transaction id. */
  addCredit(a: { customerId: string; amountMinor: number; currency: string; key: string }): Promise<string>;
  extendTrial(a: { subscriptionId: string; currentTrialEnd: number; days: number; key: string }): Promise<void>;
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

  const [fingerprint, state] = await Promise.all([deps.paymentFingerprint(inv.invoiceId), deps.referrerState(referrerId)]);
  const referrerFingerprints = state.customerId ? await deps.customerFingerprints(state.customerId) : [];
  const reward = await deps.claim({
    friendId: inv.friendId,
    fingerprint,
    referrerFingerprints,
    referrerTrialing: state.trialing && state.subscriptionId !== null && state.trialEnd !== null,
    currency: inv.currency.toUpperCase(),
  });
  if (!reward) return "nothing_to_give";

  const key = `referral:${reward.referralId}`;
  if (reward.kind === "trial_days") {
    // The claim was made while the referrer was trialing. If the trial has ended since, the days have nowhere to go.
    if (!state.subscriptionId || state.trialEnd === null) throw new Error("referral_trial_target_missing");
    await deps.extendTrial({ subscriptionId: state.subscriptionId, currentTrialEnd: state.trialEnd, days: reward.value, key });
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
