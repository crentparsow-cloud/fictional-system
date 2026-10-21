import { randomBytes } from "node:crypto";
import type Stripe from "stripe";
import { formatMinor } from "@/lib/membership-email";

/**
 * Gift memberships (5.6, 5.7) as pure helpers.
 *
 * A buyer pays once through Stripe Checkout in payment mode. The recipient
 * claims with an emailed link and needs no card. Nothing renews. When the
 * gift ends the account is back in the normal free state and every answer
 * stays readable.
 *
 * The lengths come from public.app_config (gift_months). The price of a gift
 * is never typed here: it is the membership price points multiplied out. One
 * month is the monthly price, 3 and 6 are the monthly price times 3 and 6,
 * and 12 uses the annual price. The page, the checkout and the receipt all
 * call giftPriceMinor, so what is shown is what is charged.
 */

export const DEFAULT_GIFT_MONTHS: readonly number[] = [1, 3, 6, 12];
export const DEFAULT_MESSAGE_MAX = 300;
const NAME_MAX = 60;

/** The gift lengths from config rows, or the defaults when the row is missing or unusable. */
export function giftMonthsFrom(rows: readonly { key: string; value: unknown }[] | null | undefined): number[] {
  const row = (rows ?? []).find((r) => r.key === "gift_months");
  const v = row?.value;
  if (Array.isArray(v)) {
    const months = v.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n >= 1 && n <= 24);
    const unique = [...new Set(months)].sort((a, b) => a - b);
    if (unique.length) return unique;
  }
  return [...DEFAULT_GIFT_MONTHS];
}

export function giftMessageMaxFrom(rows: readonly { key: string; value: unknown }[] | null | undefined): number {
  const n = Number((rows ?? []).find((r) => r.key === "gift_message_max")?.value);
  return Number.isInteger(n) && n >= 0 && n <= 1000 ? n : DEFAULT_MESSAGE_MAX;
}

/**
 * The price of a gift in minor units, or null when a price it needs is
 * missing. Whole years use the annual price, the rest use the monthly price.
 */
export function giftPriceMinor(months: number, monthlyMinor: number | null | undefined, yearlyMinor: number | null | undefined): number | null {
  if (!Number.isInteger(months) || months < 1) return null;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years > 0 && !(typeof yearlyMinor === "number" && yearlyMinor > 0)) return null;
  if (rest > 0 && !(typeof monthlyMinor === "number" && monthlyMinor > 0)) return null;
  return years * (yearlyMinor ?? 0) + rest * (monthlyMinor ?? 0);
}

/** "1 month", "3 months", "12 months". */
export function giftLength(months: number): string {
  return months === 1 ? "1 month" : `${months} months`;
}

export interface GiftOption {
  months: number;
  label: string;
  priceMinor: number;
  price: string;
}

/** The options to show, in order, for lengths whose price can be worked out. */
export function giftOptions(months: readonly number[], monthlyMinor: number | null, yearlyMinor: number | null, currency: string): GiftOption[] {
  const out: GiftOption[] = [];
  for (const m of months) {
    const priceMinor = giftPriceMinor(m, monthlyMinor, yearlyMinor);
    const price = priceMinor === null ? null : formatMinor(priceMinor, currency);
    if (priceMinor !== null && price) out.push({ months: m, label: giftLength(m), priceMinor, price });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The form
// ---------------------------------------------------------------------------

export interface GiftInput {
  months: number;
  recipientEmail: string;
  recipientName: string;
  senderName: string;
  message: string;
}

export type GiftProblem = "months" | "recipient_email" | "own_email" | "recipient_name" | "sender_name" | "message";

const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

/** One line of plain text: control characters and runs of spaces removed, trimmed, cut to length. */
export function plainLine(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/** The message: line breaks become spaces, so it sits in one quote in the email. */
export function plainMessage(raw: unknown, max: number): string {
  return plainLine(raw, max);
}

export function normaliseEmail(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

/** What the form means, or the first thing wrong with it. */
export function checkGiftInput(
  raw: { months: unknown; recipientEmail: unknown; recipientName?: unknown; senderName?: unknown; message?: unknown },
  opts: { allowedMonths: readonly number[]; messageMax: number; buyerEmail: string | null },
): { ok: true; value: GiftInput } | { ok: false; problem: GiftProblem } {
  const months = typeof raw.months === "string" ? Number(raw.months) : raw.months;
  if (typeof months !== "number" || !opts.allowedMonths.includes(months)) return { ok: false, problem: "months" };
  const recipientEmail = normaliseEmail(raw.recipientEmail);
  if (recipientEmail.length > 254 || !EMAIL.test(recipientEmail)) return { ok: false, problem: "recipient_email" };
  if (opts.buyerEmail && normaliseEmail(opts.buyerEmail) === recipientEmail) return { ok: false, problem: "own_email" };
  if (typeof raw.recipientName === "string" && raw.recipientName.trim().length > NAME_MAX) return { ok: false, problem: "recipient_name" };
  if (typeof raw.senderName === "string" && raw.senderName.trim().length > NAME_MAX) return { ok: false, problem: "sender_name" };
  if (typeof raw.message === "string" && raw.message.trim().length > opts.messageMax) return { ok: false, problem: "message" };
  return {
    ok: true,
    value: {
      months,
      recipientEmail,
      recipientName: plainLine(raw.recipientName, NAME_MAX),
      senderName: plainLine(raw.senderName, NAME_MAX),
      message: plainMessage(raw.message, opts.messageMax),
    },
  };
}

export const GIFT_PROBLEM_WORDS: Record<GiftProblem, string> = {
  months: "Choose how long the gift lasts.",
  recipient_email: "Check the email address you are sending the gift to.",
  own_email: "That is your own address. You can join the membership from your account instead.",
  recipient_name: "Keep their name to 60 characters.",
  sender_name: "Keep your name to 60 characters.",
  message: "Your message is too long.",
};

// ---------------------------------------------------------------------------
// The claim token and the Checkout Session
// ---------------------------------------------------------------------------

/** 192 random bits as 32 URL-safe characters. */
export function newClaimToken(): string {
  return randomBytes(24).toString("base64url");
}

export function isClaimToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{32,64}$/.test(value);
}

export interface GiftCheckoutInput {
  months: number;
  priceMinor: number;
  currency: string;
  userId: string;
  tenantId: string;
  buyerEmail: string | null;
  successUrl: string;
  cancelUrl: string;
}

/**
 * Stripe Checkout in payment mode: one charge, no subscription, no renewal.
 * Stripe sees "Akana membership gift" and the length, never a recipient or a
 * message. Tax inclusive, Stripe Tax on, like the other checkouts.
 */
export function giftCheckoutParams(i: GiftCheckoutInput): Stripe.Checkout.SessionCreateParams {
  return {
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: i.currency.toLowerCase(),
          unit_amount: i.priceMinor,
          tax_behavior: "inclusive",
          product_data: { name: "Akana membership gift", description: giftLength(i.months) },
        },
      },
    ],
    automatic_tax: { enabled: true },
    tax_id_collection: { enabled: true },
    customer_email: i.buyerEmail ?? undefined,
    client_reference_id: i.userId,
    custom_text: { submit: { message: "A gift is paid for once. Nothing renews. The person you give it to does not need a card." } },
    metadata: { kind: "gift", user_id: i.userId, tenant_id: i.tenantId, months: String(i.months) },
    payment_intent_data: { metadata: { kind: "gift", user_id: i.userId, months: String(i.months) } },
    success_url: i.successUrl,
    cancel_url: i.cancelUrl,
  };
}

/** The claim link for a token. */
export function claimUrl(origin: string, token: string): string {
  return `${origin}/gift/${token}`;
}

/** "21 October 2027" in UK time. */
export function giftDateWords(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" }).format(d);
}

/** What the You page says about a gift membership that is running. */
export function giftMembershipLine(endsAt: string): string {
  return `You have a gift membership until ${giftDateWords(endsAt)}. It does not renew and nothing will be charged.`;
}

export const GIFT_NOTICES = {
  sent: "Thank you. Your gift is paid for and we have emailed it.",
  paying: "Thank you. We are confirming your payment and will email the gift as soon as it clears.",
  claimed: "Your gift is yours. The whole library is open.",
  invalid: "That gift link does not work. It may already have been used.",
  expired: "That gift can no longer be claimed.",
} as const;
