/**
 * The trust strip (5.10): a few plain facts inside the payment box, where a
 * reader decides whether to pay, not above the page. Baymard (2025) found 19
 * percent abandoned a checkout over trust, and that a bordered payment area
 * with one or two seals inside helps.
 *
 * Rules (CMA 207, banned practice 11): a legal right is never sold as a
 * feature. The line about the 14-day right says what the law gives and what
 * the reader's own choice at checkout does to it, in the words of the consent
 * above it. It is not Akana's gift and it does not say "guarantee".
 * Everything else is a fact the product enforces: answers are sealed, there
 * are no trackers, and cancelling is two taps (You, then Cancel membership).
 *
 * Marks: none of Stripe's images ship with the app, so the only mark is the
 * words "Payments are handled by Stripe" and a padlock drawn in the page.
 * No third-party image is loaded.
 */

export type TrustKind = "workbook" | "membership" | "both";

export interface TrustItem {
  id: "sealed" | "trackers" | "cancel" | "law";
  text: string;
}

const SEALED: TrustItem = { id: "sealed", text: "Your answers are sealed. Nobody at Akana can read them." };
const TRACKERS: TrustItem = { id: "trackers", text: "No trackers and no advertising pixels." };
const CANCEL: TrustItem = { id: "cancel", text: "Cancel in two taps: You, then Cancel membership." };
const LAW_WORKBOOK: TrustItem = {
  id: "law",
  text: "Your 14-day cancellation right under UK law ends when access starts, because you ask for access to start now. The box above says so.",
};
const LAW_MEMBERSHIP: TrustItem = {
  id: "law",
  text: "Your 14-day cancellation right under UK law applies. Cancel in the first 14 days and you are refunded for the days you have not used.",
};

export const PAYMENT_MARK = "Payments are handled by Stripe.";

export function trustItems(kind: TrustKind): TrustItem[] {
  if (kind === "workbook") return [SEALED, TRACKERS, LAW_WORKBOOK];
  if (kind === "membership") return [SEALED, TRACKERS, CANCEL, LAW_MEMBERSHIP];
  return [SEALED, TRACKERS, CANCEL, LAW_MEMBERSHIP, LAW_WORKBOOK];
}
