import type Stripe from "stripe";

/**
 * Connect Express payouts (F-099), the pure part: what a Stripe account
 * means for Akana, the countries self-serve payouts reach, and the account
 * Akana asks Stripe to create. No network and no Next, so it can be tested.
 *
 * Akana keeps two things about a connected account: its id and one status.
 * Bank details, identity documents and the rest stay with Stripe.
 */

export const PAYOUT_STATUSES = ["not_started", "pending", "verified", "action_needed", "held"] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export function isPayoutStatus(v: unknown): v is PayoutStatus {
  return typeof v === "string" && (PAYOUT_STATUSES as readonly string[]).includes(v);
}

/** What the payee sees for each status. Plain, short, no blame. */
export const PAYOUT_STATUS_COPY: Record<PayoutStatus, { label: string; detail: string }> = {
  not_started: { label: "Not started", detail: "Connect a payout account so we can pay you." },
  pending: { label: "Being checked", detail: "Stripe is checking your details. This usually takes a day or two." },
  verified: { label: "Verified", detail: "Your payout account is ready. Earnings are paid to it each month." },
  action_needed: { label: "Action needed", detail: "Stripe needs a little more from you before payouts can start." },
  held: {
    label: "Payouts on hold",
    detail:
      "We cannot pay accounts in your country through Stripe yet. Your earnings are recorded and held safely, and we will contact you about another way to pay you.",
  },
};

/**
 * Self-serve cross-border payouts from a UK platform reach the UK, the EEA,
 * the US, Canada and Switzerland (research_money.md). Kept in step with
 * app.payout_country_supported in migration 0014.
 */
export const SELF_SERVE_PAYOUT_COUNTRIES: readonly string[] = [
  "GB", "US", "CA", "CH",
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO",
];

export function isSelfServePayoutCountry(country: string | null | undefined): boolean {
  return typeof country === "string" && SELF_SERVE_PAYOUT_COUNTRIES.includes(country.toUpperCase());
}

/**
 * The status for a Connect account as Stripe reports it. Akana pays by
 * separate charges and transfers, so the only capability that matters is
 * transfers.
 *
 *  - transfers active and payouts enabled: verified
 *  - onboarding not finished, anything past due, or the account disabled for
 *    a reason other than Stripe's own pending check: action_needed
 *  - otherwise, details are in and Stripe is checking: pending
 *
 * Held is never derived from Stripe. It is set by Akana and lifted by staff.
 */
export function connectStatusFromAccount(
  account: Pick<Stripe.Account, "details_submitted" | "payouts_enabled" | "capabilities" | "requirements">,
): Exclude<PayoutStatus, "not_started" | "held"> {
  const transfers = account.capabilities?.transfers;
  const req = account.requirements;
  const pastDue = req?.past_due?.length ?? 0;
  const disabled = req?.disabled_reason ?? null;
  if (transfers === "active" && account.payouts_enabled && pastDue === 0) return "verified";
  if (!account.details_submitted) return "action_needed";
  if (pastDue > 0) return "action_needed";
  if (disabled && disabled !== "requirements.pending_verification" && disabled !== "under_review") return "action_needed";
  return "pending";
}

export interface PayeeOrganisation {
  orgId: string;
  kind: string;
  country: string;
}

/**
 * The service agreement for a connected account. Accounts in the platform's
 * own country take the full agreement. Accounts elsewhere take the
 * recipient agreement, which cross-border payouts need. US accounts are
 * kept on the full agreement here because Stripe does not offer the
 * recipient agreement to US accounts [check with Stripe before live].
 */
export function serviceAgreementFor(country: string): "full" | "recipient" {
  const c = country.toUpperCase();
  return c === "GB" || c === "US" ? "full" : "recipient";
}

/**
 * The Express account Akana asks Stripe to create. Stripe collects the
 * requirements and hosts the dashboard; the platform carries fees and
 * losses, as the separate charges and transfers model needs. Only the
 * organisation id goes into metadata: no name, no email, no title.
 */
export function accountCreateParams(org: PayeeOrganisation): Stripe.AccountCreateParams {
  const country = org.country.toUpperCase();
  return {
    country,
    business_type: org.kind === "individual" ? "individual" : "company",
    controller: {
      stripe_dashboard: { type: "express" },
      fees: { payer: "application" },
      losses: { payments: "application" },
      requirement_collection: "stripe",
    },
    capabilities: { transfers: { requested: true } },
    tos_acceptance: { service_agreement: serviceAgreementFor(country) },
    metadata: { akana_org_id: org.orgId },
  };
}

/** The idempotency key for creating an organisation's account, so a double click makes one account. */
export function accountIdempotencyKey(orgId: string): string {
  return `akana-connect-account-${orgId}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

/** The return and refresh URLs Stripe sends the payee back to. */
export function onboardingUrls(origin: string, orgId: string): { return_url: string; refresh_url: string } {
  const q = `org=${encodeURIComponent(orgId)}`;
  return { return_url: `${origin}/payouts/return?${q}`, refresh_url: `${origin}/payouts/refresh?${q}` };
}

/** Database error codes from migration 0014, as plain messages. */
export function payoutErrorMessage(code: string | null | undefined): string {
  switch (code) {
    case "AKY01":
      return "Only the owner or finance contact of this organisation can change payouts.";
    case "AKY02":
      return "Some details are missing. Check the country on your organisation and try again.";
    case "AKY03":
      return "For your security, enter a code from your authenticator app first.";
    case "AKY04":
      return "This organisation is not paid through Stripe.";
    case "AKY29":
      return "There have been a lot of payout changes today. Try again tomorrow, or contact support.";
    default:
      return "Something went wrong. Nothing was changed. Try again in a moment.";
  }
}
