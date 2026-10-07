import type Stripe from "stripe";
import type { MembershipPricePointId } from "@/lib/pricing";

/**
 * Membership (F-097) as pure helpers: which Stripe prices are configured,
 * the Checkout Session parameters for subscription mode, how a Stripe
 * subscription maps to the row in public.subscriptions (migration 0009),
 * and what the You page says about a reader's membership.
 *
 * PLACEHOLDER: the membership prices are not set (questions C4 and D1 to D4
 * are open). Until Crent creates the two recurring prices in Stripe and puts
 * their ids in STRIPE_PRICE_MEMBERSHIP_MONTHLY and _YEARLY, the membership
 * checkout says "not open yet" and the paywall button stays disabled.
 *
 * Stripe never sees a title. The membership product in Stripe is named
 * "Akana membership", so statements, receipts and Stripe's own emails carry
 * the plan only (F-098).
 */

export type MembershipPlan = "monthly" | "yearly";
export const MEMBERSHIP_PLANS: readonly MembershipPlan[] = ["monthly", "yearly"];

export const MEMBERSHIP_PLAN_POINT: Readonly<Record<MembershipPlan, MembershipPricePointId>> = {
  monthly: "member_month",
  yearly: "member_year",
};

export const MEMBERSHIP_PRICE_ENV: Readonly<Record<MembershipPlan, "STRIPE_PRICE_MEMBERSHIP_MONTHLY" | "STRIPE_PRICE_MEMBERSHIP_YEARLY">> = {
  monthly: "STRIPE_PRICE_MEMBERSHIP_MONTHLY",
  yearly: "STRIPE_PRICE_MEMBERSHIP_YEARLY",
};

/** What the checkout and paywall say while no membership price is configured. */
export const MEMBERSHIP_NOT_OPEN_MESSAGE = "Membership is not open yet. Please try again soon.";

type Env = Partial<Record<string, string | undefined>>;

export function isMembershipPlan(value: unknown): value is MembershipPlan {
  return value === "monthly" || value === "yearly";
}

/** The Stripe price id for a plan, or null when it is unset or not a price id. */
export function membershipPriceId(plan: MembershipPlan, env: Env = process.env): string | null {
  const v = env[MEMBERSHIP_PRICE_ENV[plan]]?.trim();
  return v && /^price_[A-Za-z0-9_]+$/.test(v) ? v : null;
}

/** Which plans can be bought right now. */
export function membershipPlansOpen(env: Env = process.env): Record<MembershipPlan, boolean> {
  return { monthly: membershipPriceId("monthly", env) !== null, yearly: membershipPriceId("yearly", env) !== null };
}

/** The line shown on Stripe's page above the pay button: the auto-renewal consent (F-097). */
export function autoRenewNotice(plan: MembershipPlan): string {
  const period = plan === "monthly" ? "month" : "year";
  return `Your membership renews automatically each ${period} until you cancel. You can cancel at any time in your account. You keep access until the end of the period you have paid for.`;
}

export interface MembershipCheckoutInput {
  plan: MembershipPlan;
  priceId: string;
  userId: string;
  tenantId: string;
  /** Used only when the reader has no Stripe customer yet. */
  email: string | null;
  /** The reader's existing Stripe customer, so a returning member keeps one customer and one portal. */
  customerId: string | null;
  successUrl: string;
  cancelUrl: string;
}

/**
 * Checkout Session parameters for a membership. Kept in step with the single
 * workbook checkout: Stripe Tax on (Akana is the seller of record, not
 * Stripe Managed Payments), promotion codes and the tax id field on. The
 * reader and tenant go in the subscription's metadata so every later
 * customer.subscription.* event can be tied back without a lookup.
 */
export function membershipCheckoutParams(i: MembershipCheckoutInput): Stripe.Checkout.SessionCreateParams {
  const metadata = { user_id: i.userId, tenant_id: i.tenantId, plan: MEMBERSHIP_PLAN_POINT[i.plan] };
  return {
    mode: "subscription",
    line_items: [{ price: i.priceId, quantity: 1 }],
    automatic_tax: { enabled: true },
    allow_promotion_codes: true,
    tax_id_collection: { enabled: true },
    ...(i.customerId
      ? { customer: i.customerId, customer_update: { name: "auto", address: "auto" } }
      : { customer_email: i.email ?? undefined }),
    client_reference_id: i.userId,
    metadata,
    subscription_data: { metadata },
    custom_text: { submit: { message: autoRenewNotice(i.plan) } },
    success_url: i.successUrl,
    cancel_url: i.cancelUrl,
  };
}

// ---------------------------------------------------------------------------
// Stripe subscription -> public.subscriptions
// ---------------------------------------------------------------------------

/** Stripe's statuses that the table accepts. Anything new is ignored rather than stored. */
export const SUBSCRIPTION_STATUSES = ["incomplete", "incomplete_expired", "trialing", "active", "past_due", "canceled", "unpaid", "paused"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export function isSubscriptionStatus(v: unknown): v is SubscriptionStatus {
  return typeof v === "string" && (SUBSCRIPTION_STATUSES as readonly string[]).includes(v);
}

export interface SubscriptionState {
  subscriptionId: string;
  customerId: string;
  userId: string | null;
  tenantId: string | null;
  status: SubscriptionStatus;
  plan: MembershipPricePointId | null;
  priceId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  cancelAt: string | null;
  canceledAt: string | null;
  endedAt: string | null;
  /** When this state was read from Stripe. Older observations never overwrite newer ones. */
  observedAt: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidOrNull(v: unknown): string | null {
  return typeof v === "string" && UUID.test(v) ? v.toLowerCase() : null;
}

function iso(seconds: number | null | undefined): string | null {
  return typeof seconds === "number" && Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : null;
}

function idOf(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

export function planFromInterval(interval: string | null | undefined): MembershipPricePointId | null {
  if (interval === "month") return "member_month";
  if (interval === "year") return "member_year";
  return null;
}

/**
 * The row for a Stripe subscription, or null when it cannot be stored (an
 * unknown status or a missing customer). The period end comes from the
 * first item: it moved off the subscription in API 2025-03-31.
 * fallbackMeta covers a subscription created before its metadata was set.
 */
export function subscriptionStateFrom(
  sub: Stripe.Subscription,
  observedAt: Date,
  fallbackMeta?: { user_id?: string | null; tenant_id?: string | null } | null,
): SubscriptionState | null {
  if (!isSubscriptionStatus(sub.status)) return null;
  const customerId = idOf(sub.customer as string | { id: string } | null);
  if (!customerId) return null;
  const item = sub.items?.data?.[0];
  const meta = (sub.metadata ?? {}) as Record<string, string | undefined>;
  const metaPlan = meta.plan === "member_month" || meta.plan === "member_year" ? meta.plan : null;
  return {
    subscriptionId: sub.id,
    customerId,
    userId: uuidOrNull(meta.user_id) ?? uuidOrNull(fallbackMeta?.user_id),
    tenantId: uuidOrNull(meta.tenant_id) ?? uuidOrNull(fallbackMeta?.tenant_id),
    status: sub.status,
    plan: planFromInterval(item?.price?.recurring?.interval) ?? metaPlan,
    priceId: item?.price?.id ?? null,
    currentPeriodEnd: iso(item?.current_period_end),
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    cancelAt: iso(sub.cancel_at),
    canceledAt: iso(sub.canceled_at),
    endedAt: iso(sub.ended_at),
    observedAt: observedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// The You page
// ---------------------------------------------------------------------------

export interface SubscriptionRow {
  status: string;
  plan: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  ended_at: string | null;
  stripe_customer_id: string | null;
  updated_at?: string | null;
}

export type MembershipSummary =
  | { kind: "none" }
  | { kind: "active"; plan: "monthly" | "yearly" | null; renewsOn: string | null }
  | { kind: "ending"; endsOn: string | null }
  | { kind: "payment_issue" }
  | { kind: "ended" };

const LIVE = new Set(["active", "trialing", "past_due"]);

/**
 * The one line the You page shows. A live subscription wins over ended ones;
 * among several live ones the most recently updated wins.
 */
export function membershipSummary(rows: readonly SubscriptionRow[] | null | undefined): MembershipSummary {
  if (!rows || rows.length === 0) return { kind: "none" };
  const sorted = [...rows].sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")));
  const live = sorted.find((r) => LIVE.has(r.status));
  if (!live) {
    return sorted.some((r) => r.status === "canceled" || r.status === "unpaid" || r.status === "paused") ? { kind: "ended" } : { kind: "none" };
  }
  if (live.status === "past_due") return { kind: "payment_issue" };
  if (live.cancel_at_period_end) return { kind: "ending", endsOn: live.current_period_end };
  const plan = live.plan === "member_month" ? "monthly" : live.plan === "member_year" ? "yearly" : null;
  return { kind: "active", plan, renewsOn: live.current_period_end };
}

/** The Stripe customer to open the portal for: the most recent row that has one. */
export function portalCustomerId(rows: readonly SubscriptionRow[] | null | undefined): string | null {
  if (!rows) return null;
  const sorted = [...rows].sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")));
  return sorted.find((r) => r.stripe_customer_id)?.stripe_customer_id ?? null;
}

/** True when the reader already holds a live membership, so checkout should not start another. */
export function hasLiveMembership(rows: readonly SubscriptionRow[] | null | undefined): boolean {
  return Boolean(rows?.some((r) => LIVE.has(r.status)));
}

/** Plain words for the You page. Dates are formatted by the caller. */
export function membershipLine(summary: MembershipSummary, formatDate: (iso: string) => string): string {
  switch (summary.kind) {
    case "none":
      return "You are not a member at the moment.";
    case "active": {
      const name = summary.plan === "yearly" ? "Annual membership." : summary.plan === "monthly" ? "Monthly membership." : "Membership active.";
      return summary.renewsOn ? `${name} Renews on ${formatDate(summary.renewsOn)}.` : name;
    }
    case "ending":
      return summary.endsOn
        ? `Your membership ends on ${formatDate(summary.endsOn)}. It will not renew.`
        : "Your membership will not renew.";
    case "payment_issue":
      return "Your last payment did not go through. Please update your payment details so your membership carries on.";
    case "ended":
      return "Your membership has ended. Everything you wrote is still here.";
  }
}

/** Notices for /you?membership=... after the portal or checkout. Unknown values show nothing. */
export const MEMBERSHIP_NOTICES = {
  unavailable: "Managing your membership is not available just now. Please try again later.",
  welcome: "Thank you for joining. Your membership may take a minute to show here.",
} as const;

export function membershipNotice(code: string | string[] | undefined): string | null {
  const c = Array.isArray(code) ? code[0] : code;
  return c && c in MEMBERSHIP_NOTICES ? MEMBERSHIP_NOTICES[c as keyof typeof MEMBERSHIP_NOTICES] : null;
}
