import { monthlyEquivalentMinor } from "@/lib/price-display";
import { MARKETS } from "@/lib/markets";
import { amountFor, formatPrice, pricePointFromRow, PRICE_TO_BE_CONFIRMED, WORKBOOK_AMOUNTS } from "@/lib/pricing";
import type { PricePointRowLike } from "@/lib/plans";
import { trialLabel, type TrialConfig } from "@/lib/membership-trial";

/**
 * The pricing page (5.4) as data. The page only lays it out.
 *
 * Rules, all from the plan's DMCC and CMA list and checked in the tests:
 *  - The annual plan is shown as a monthly equivalent with the yearly total
 *    beside it, both at the same size (14.21).
 *  - No struck-through price, no "was", no "save", no per-day sum.
 *  - Nothing paid is called free. "Week 1 is free, no card" is true of the
 *    first unit of a workbook and appears only as that.
 *  - A trial is described by its length and what follows, never as free.
 *  - The recommended plan comes first and carries a badge. It is the annual
 *    plan, the lower monthly figure, when the annual price is set.
 *  - Key terms (price, period, renewal, how to cancel) sit together on each
 *    membership card.
 */

export type PlanId = "annual" | "monthly" | "two" | "workbook";

export interface PlanCard {
  id: PlanId;
  heading: string;
  /** "Recommended" on one card, else null. */
  badge: string | null;
  /** The two figures, same size. `secondary` is the yearly total for the annual plan, else null. */
  primary: string;
  secondary: string | null;
  /** A single plain sentence on what is charged and when. */
  billing: string;
  /** The key terms, together. */
  terms: string[];
  /** The checkout plan the Join button starts, or null for a card that links elsewhere. */
  checkout: "yearly" | "monthly" | "two_monthly" | null;
  /** For the workbook card: where to look at the library. */
  href: string | null;
}

export interface PricingInput {
  rows: readonly PricePointRowLike[] | null | undefined;
  trial: TrialConfig;
  /** The two-person plan can be bought now (its Stripe price id is set). */
  sharedOpen: boolean;
  /** The single-person plans that can be bought now. */
  open: { monthly: boolean; yearly: boolean };
}

const gb = MARKETS.GB;

function minorFor(rows: readonly PricePointRowLike[], id: string): number | null {
  const row = rows.find((r) => r.id === id);
  const point = row ? pricePointFromRow(row) : null;
  if (!point || !point.active || point.kind !== "membership") return null;
  return amountFor(point, gb);
}

export const CANCEL_TERMS = "Cancel in two taps: You, then Cancel membership. You do not have to give a reason.";
const COOLING = "Cancel in the first 14 days and you are refunded for the days you have not used.";

function trialTerm(plan: "monthly" | "yearly", days: number, price: string): string | null {
  return days > 0 ? `Starts with a trial: ${trialLabel(plan, days, price)}. A card is needed to start it. Nothing is taken until the first payment date, and we email you three days before.` : null;
}

/** The cards, recommended first. A plan with no decided price is left out, except that nothing is invented. */
export function planCards(input: PricingInput): PlanCard[] {
  const rows = input.rows ?? [];
  const monthlyMinor = minorFor(rows, "member_month");
  const yearlyMinor = minorFor(rows, "member_year");
  const twoMinor = minorFor(rows, "member_two_month");
  const cards: PlanCard[] = [];

  if (yearlyMinor !== null) {
    const total = formatPrice(yearlyMinor, gb);
    cards.push({
      id: "annual",
      heading: "Membership, annual",
      badge: null,
      primary: `${formatPrice(monthlyEquivalentMinor(yearlyMinor), gb)} a month`,
      secondary: `${total} a year`,
      billing: `${total} once a year, until you cancel. The monthly figure is the yearly price divided by twelve.`,
      terms: [
        ...(trialTerm("yearly", input.trial.yearly, total) ? [trialTerm("yearly", input.trial.yearly, total)!] : []),
        "Renews once a year, automatically, until you cancel. We email you before each renewal.",
        COOLING,
        CANCEL_TERMS,
      ],
      checkout: input.open.yearly ? "yearly" : null,
      href: null,
    });
  }
  if (monthlyMinor !== null) {
    const price = formatPrice(monthlyMinor, gb);
    cards.push({
      id: "monthly",
      heading: "Membership, monthly",
      badge: null,
      primary: `${price} a month`,
      secondary: null,
      billing: `${price} each month, until you cancel.`,
      terms: [
        ...(trialTerm("monthly", input.trial.monthly, price) ? [trialTerm("monthly", input.trial.monthly, price)!] : []),
        "Renews every month, automatically, until you cancel. We email you every six months with the price and the next payment date.",
        COOLING,
        CANCEL_TERMS,
      ],
      checkout: input.open.monthly ? "monthly" : null,
      href: null,
    });
  }
  if (twoMinor !== null && input.sharedOpen) {
    const price = formatPrice(twoMinor, gb);
    cards.push({
      id: "two",
      heading: "Membership for two people",
      badge: null,
      primary: `${price} a month`,
      secondary: null,
      billing: `${price} each month for two people, until you cancel. About one and a half times the single monthly price.`,
      terms: [
        "One person pays and owns the membership. The second person joins from a link, and each of you keeps your own sealed answers.",
        "Renews every month, automatically, until you cancel. If the person who pays cancels, you both lose access at the end of the paid period.",
        COOLING,
        CANCEL_TERMS,
      ],
      checkout: "two_monthly",
      href: null,
    });
  }
  // The workbook card, last: a range from the ladder, shown as prices, never a discount.
  const amounts = Object.values(WORKBOOK_AMOUNTS).map((a) => a.GBP ?? 0).filter((n) => n > 0);
  const lo = amounts.length ? Math.min(...amounts) : null;
  const hi = amounts.length ? Math.max(...amounts) : null;
  cards.push({
    id: "workbook",
    heading: "One workbook",
    badge: null,
    primary: lo !== null && hi !== null ? `${formatPrice(lo, gb)} to ${formatPrice(hi, gb)}` : PRICE_TO_BE_CONFIRMED,
    secondary: null,
    billing: "Paid once. Each workbook page shows its own price.",
    terms: [
      "Yours to keep. No renewal.",
      "Week 1 is free, no card. Read the first week before you decide.",
      "Access starts when you pay. Because it starts at once, the 14-day right to cancel ends then, as the box at checkout says.",
    ],
    checkout: null,
    href: "/library",
  });

  const first = cards.find((c) => c.id === "annual") ?? cards.find((c) => c.id === "monthly");
  if (first) first.badge = "Recommended";
  return [...cards].sort((a, b) => (a.badge ? -1 : 0) - (b.badge ? -1 : 0));
}

// ---------------------------------------------------------------------------
// Which should I pick. Plain, no pressure, no claim that one is the best.
// ---------------------------------------------------------------------------

export const WHICH_TO_PICK: readonly { label: string; text: string }[] = [
  { label: "One workbook", text: "Pick this if one book is the one you want. You pay once and keep it. Nothing renews." },
  { label: "Monthly membership", text: "Pick this to try several workbooks, or if you do not know how long you will use it. You can stop at any time." },
  { label: "Annual membership", text: "Pick this if you expect to use the library for most of a year. The monthly figure is lower, and you pay once a year." },
  { label: "Membership for two people", text: "Pick this if you and one other person would each use it. Each of you keeps your own sealed answers." },
];

// ---------------------------------------------------------------------------
// FAQ. Real steps, real dates, nothing promised that the product does not do.
// ---------------------------------------------------------------------------

export interface Faq {
  q: string;
  a: string;
}

export const FAQ: readonly Faq[] = [
  {
    q: "Can I cancel?",
    a: "Yes, at any time. Go to You, then Cancel membership, then press Cancel. That is two taps. You do not have to give a reason. You can also write to support and say you want to cancel, and we will do it. We email you to confirm as soon as it is done. You keep access until the end of the period you have paid for, and nothing more is charged.",
  },
  {
    q: "What if I cancel in the first 14 days?",
    a: "Your membership ends that day and you are refunded for the days you have not used. The refund goes back to the card you paid with and the email we send says how much.",
  },
  {
    q: "What happens to my answers if I cancel?",
    a: "They stay yours. They are sealed with your own account, so nobody at Akana can read them. You can still read everything you wrote and download it from the You page.",
  },
  {
    q: "Can I pause instead?",
    a: "On the monthly plans, yes, for one to three months. It is offered on the cancel screen. Nothing is charged while it is paused and your answers stay readable. Payments restart on the date we show you.",
  },
  {
    q: "When am I charged?",
    a: "The first payment date is shown before you pay. A membership that starts with a trial takes nothing until the trial ends, and we email you three days before. After that it renews each month or each year until you cancel.",
  },
  {
    q: "Is there a free week?",
    a: "The first week of any workbook is free to read, with no card. That is a sample of the workbook. The membership is paid.",
  },
  {
    q: "Do you track me?",
    a: "No. There are no advertising trackers, pixels or third-party scripts on Akana.",
  },
];
