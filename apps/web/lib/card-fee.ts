/**
 * The card fee used by the Studio share estimate. Stripe UK standard rate for
 * UK consumer cards: 1.5 percent plus 20 pence a charge. Checked against
 * Stripe's published UK pricing on 16 October 2026. It is a guide for the
 * estimate only. Real sales use the fee Stripe actually charged, read from the
 * balance transaction (lib/money/ledger.ts). Change both values here, nowhere else.
 */
export const CARD_FEE_RATE = 0.015;
export const CARD_FEE_FIXED_MINOR = 20;
