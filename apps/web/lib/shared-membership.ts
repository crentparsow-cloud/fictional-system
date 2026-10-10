import { membershipPriceId } from "@/lib/membership";

/**
 * Shared membership (item 6.1, 13.10) as pure helpers: the invitation token,
 * the link the buyer shares, the words the invitee reads before accepting,
 * how the You page describes a seat, and the offer copy for the places that
 * mention the two-person plan.
 *
 * The shape (migration 0041). One Stripe subscription is owned by the buyer.
 * One invited member joins by a link the buyer shares through their own
 * channels. Akana never emails the invitee: there is no address to send to,
 * and nothing in this file sends anything. The two people share only the
 * entitlement. Answers, enrolments and settings stay each person's own, and
 * row level security keeps it that way.
 *
 * PLACEHOLDER: the price. The plan point member_two_month is seeded at about
 * 1.5 times the single monthly price. Until Crent creates the recurring price
 * in Stripe and puts its id in STRIPE_PRICE_MEMBERSHIP_TWO_MONTHLY, the
 * two-person checkout says "not open yet" and every offer below stays hidden.
 */

/** The line used wherever the plan is offered. */
export const SHARED_PLAN_POSITIONING = "Two people, one price, each with sealed answers";

/** The plan's name in lists and on receipts. */
export const SHARED_PLAN_LABEL = "Membership for two people";

/** How long an unused invitation link works. Matches the default in migration 0041. */
export const INVITE_DAYS = 14;

type Env = Partial<Record<string, string | undefined>>;

/** True when the two-person plan can be bought: its Stripe price id is set. */
export function sharedPlanOpen(env: Env = process.env): boolean {
  return membershipPriceId("two_monthly", env) !== null;
}

/** The sentence the buyer's own share sheet carries. It names no workbook. */
export function inviteShareText(): string {
  return "I would like to share my Akana membership with you. This link lets you join it.";
}

// ---------------------------------------------------------------------------
// What the invitee reads before accepting
// ---------------------------------------------------------------------------

export const INVITE_STATEMENTS: readonly string[] = [
  "Joining gives you the same access to the membership as the person who invited you.",
  "Your answers are yours. They are sealed with your own account, so the person who invited you cannot read them, and you cannot read theirs.",
  "You keep your own place in every workbook, and your own settings.",
  "The person who invited you pays for the membership and can remove you at any time. You can leave at any time too.",
  "If they cancel, your access ends when their current period ends.",
  "You do not pay anything, and nothing is charged to you.",
];

/** Outcomes of seat_accept (migration 0041) in plain words. */
export type AcceptOutcome = "joined" | "invalid" | "expired" | "own_link" | "has_membership" | "in_seat" | "unavailable";

export function isAcceptOutcome(v: unknown): v is AcceptOutcome {
  return v === "joined" || v === "invalid" || v === "expired" || v === "own_link" || v === "has_membership" || v === "in_seat" || v === "unavailable";
}

export const ACCEPT_MESSAGES: Readonly<Record<Exclude<AcceptOutcome, "joined">, string>> = {
  invalid: "This link no longer works. It may have been used or withdrawn. Ask the person who sent it for a new one.",
  expired: "This link has expired. Ask the person who sent it for a new one.",
  own_link: "This is your own invitation link. Send it to the person you want to share with.",
  has_membership: "You already have a membership of your own, so this place cannot be used. Cancel yours first if you would rather share.",
  in_seat: "You already have a place on a shared membership. Leave it first if you would rather join this one.",
  unavailable: "The membership this link belongs to is not running any more. Ask the person who sent it.",
};

// ---------------------------------------------------------------------------
// The You page
// ---------------------------------------------------------------------------

/** A row from public.my_shared_seat(): the buyer's view, with no word about who holds the place. */
export interface BuyerSeatRow {
  seat_id: string | null;
  seat_status: string | null;
  invited_at: string | null;
  expires_at: string | null;
  accepted_at: string | null;
}

export type BuyerSeatView =
  | { kind: "none" } // not on the two-person plan
  | { kind: "empty" } // on the plan, nobody invited
  | { kind: "invited"; expiresAt: string | null; expired: boolean }
  | { kind: "joined"; since: string | null };

export function buyerSeatView(rows: readonly BuyerSeatRow[] | null | undefined, now: Date): BuyerSeatView {
  const row = rows?.[0];
  if (!row) return { kind: "none" };
  if (row.seat_status === "active") return { kind: "joined", since: row.accepted_at };
  if (row.seat_status === "invited") {
    const expired = row.expires_at ? new Date(row.expires_at).getTime() <= now.getTime() : false;
    return { kind: "invited", expiresAt: row.expires_at, expired };
  }
  return { kind: "empty" };
}

export function buyerSeatLine(view: BuyerSeatView, formatDate: (iso: string) => string): string {
  switch (view.kind) {
    case "none":
      return "";
    case "empty":
      return "Your second place is empty. Make a link and send it to the person you want to share with.";
    case "invited":
      if (view.expired) return "Your invitation link has expired. Make a new one.";
      return view.expiresAt ? `Your invitation is waiting. The link works until ${formatDate(view.expiresAt)}.` : "Your invitation is waiting.";
    case "joined":
      return view.since ? `Your second place is taken. They joined on ${formatDate(view.since)}.` : "Your second place is taken.";
  }
}

/** The member's own seat row, as the You page reads it (columns granted in 0041). */
export interface MemberSeatRow {
  id: string;
  status: string;
  accepted_at: string | null;
}

export function memberSeatLine(row: MemberSeatRow | null | undefined): string | null {
  if (!row || row.status !== "active") return null;
  return "You have a place on a shared membership. You pay nothing. The person who invited you can remove you, and you can leave at any time. Your answers stay yours either way.";
}

/** Notices for /you?shared=... after a seat action. Unknown values show nothing. */
export const SHARED_NOTICES = {
  joined: "You have joined the shared membership.",
  left: "You have left the shared membership. Your answers are still yours.",
  removed: "The second place is open again. Their answers stay theirs.",
  withdrawn: "The invitation link no longer works.",
  failed: "That did not work. Please try again.",
} as const;

export function sharedNotice(code: string | string[] | undefined): string | null {
  const c = Array.isArray(code) ? code[0] : code;
  return c && c in SHARED_NOTICES ? SHARED_NOTICES[c as keyof typeof SHARED_NOTICES] : null;
}

// ---------------------------------------------------------------------------
// Offers. The pricing page and the post-trial upsell show the plan today
// (see below). The cancellation screen and month three have no screen yet:
// these helpers are the hook points, named for where they belong.
// ---------------------------------------------------------------------------

export type SharedOfferPlacement = "pricing" | "post_trial" | "cancellation" | "month_three";

export interface SharedOffer {
  placement: SharedOfferPlacement;
  headline: string;
  body: string;
  cta: string;
  /** Where the button goes. The pricing anchor explains the plan and opens the two-person checkout. */
  href: string;
}

const BODY = "Share one membership with a person you choose. You each keep your own answers, sealed with your own account, and your own place in every workbook. You can remove them at any time.";

/**
 * The offer for a placement, or null while the plan cannot be bought. No
 * price is written here: the caller shows the price from the database next
 * to it. Nothing counts down, nothing is struck through and nothing is
 * called free.
 */
export function sharedPlanOffer(placement: SharedOfferPlacement, env: Env = process.env): SharedOffer | null {
  if (!sharedPlanOpen(env)) return null;
  const href = "/pricing#two-people";
  switch (placement) {
    case "pricing":
      return { placement, headline: SHARED_PLAN_POSITIONING, body: BODY, cta: "Share a membership", href };
    case "post_trial":
      return { placement, headline: SHARED_PLAN_POSITIONING, body: BODY, cta: "See membership for two", href };
    case "cancellation":
      return {
        placement,
        headline: SHARED_PLAN_POSITIONING,
        body: `If the cost is the reason, sharing may help. ${BODY}`,
        cta: "See membership for two",
        href,
      };
    case "month_three":
      return { placement, headline: SHARED_PLAN_POSITIONING, body: BODY, cta: "See membership for two", href };
  }
}

/** Whole months between two instants, counted on the calendar in UTC. */
function monthsBetween(from: Date, to: Date): number {
  let m = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) m -= 1;
  return m;
}

/**
 * True during the fourth month of a single-person membership, which is where
 * the month-three offer belongs. Only for plans that are not already shared,
 * and only while the membership is running and not ending.
 */
export function isMonthThree(sub: { plan: string | null; status: string; cancelAtPeriodEnd: boolean; startedAt: string }, now: Date): boolean {
  if (sub.plan === "member_two_month") return false;
  if (sub.status !== "active" && sub.status !== "trialing") return false;
  if (sub.cancelAtPeriodEnd) return false;
  return monthsBetween(new Date(sub.startedAt), now) === 3;
}
