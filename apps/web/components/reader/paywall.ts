import { PRICE_TO_BE_CONFIRMED, type Price } from "@/lib/pricing";

/**
 * What the calm paywall shows (F-019), as data. The card replaces a unit the
 * reader's entitlement does not cover. It never covers the Toolkit tab or
 * Help now, never counts down and never says anything about scarcity.
 *
 *   entitled            nothing: the unit opens
 *   demo                no buttons, one line saying demo titles are not sold
 *   otherwise           what the full workbook includes, that answers carry
 *                       over, and two buttons. A button with no price is
 *                       disabled and says "Price to be confirmed".
 */

export interface PaywallInput {
  /** The reader's entitlement covers this unit. */
  entitled: boolean;
  /** Demo titles are never sold (F-114). */
  demo: boolean;
  /** priceFor() for this workbook, or null while the price is a placeholder. */
  workbookPrice: Price | null;
  /** The membership price, or null while it is a placeholder. */
  membershipPrice: Price | null;
  /**
   * Whether a membership checkout exists. Until F-097 lands there is nowhere
   * to send a reader, so the button stays disabled even with a price.
   */
  membershipCheckoutReady?: boolean;
}

export interface PaywallButton {
  enabled: boolean;
  label: "Buy this workbook" | "Join the membership";
  /** Shown inside the button under the label: the price, or why it is disabled. */
  note: string;
}

export type PaywallState =
  | { kind: "open" }
  | { kind: "demo"; message: string }
  | { kind: "offer"; buy: PaywallButton; membership: PaywallButton };

export const DEMO_NOT_FOR_SALE = "This is a demo title. Demo titles cannot be bought.";
export const MEMBERSHIP_NOT_OPEN = "Membership is not open yet";

export function paywallState(input: PaywallInput): PaywallState {
  if (input.entitled) return { kind: "open" };
  if (input.demo) return { kind: "demo", message: DEMO_NOT_FOR_SALE };

  const buy: PaywallButton = input.workbookPrice
    ? { enabled: true, label: "Buy this workbook", note: input.workbookPrice.formatted }
    : { enabled: false, label: "Buy this workbook", note: PRICE_TO_BE_CONFIRMED };

  let membership: PaywallButton;
  if (!input.membershipPrice) membership = { enabled: false, label: "Join the membership", note: PRICE_TO_BE_CONFIRMED };
  else if (!input.membershipCheckoutReady) membership = { enabled: false, label: "Join the membership", note: MEMBERSHIP_NOT_OPEN };
  else membership = { enabled: true, label: "Join the membership", note: `${input.membershipPrice.formatted} a month` };

  return { kind: "offer", buy, membership };
}

/** "8 weeks", "1 module": the unit count from the listing in plain words. */
export function unitCountPhrase(count: number, unit: "week" | "day" | "module" | "chapter"): string {
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}
