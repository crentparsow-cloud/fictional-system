/**
 * The trust page (F-121). Every statement here is something the code
 * enforces today, and each one names where. lib/trust.test.ts checks that
 * every file it names exists, so a claim cannot outlive its mechanism
 * without a failing test. Do not add a promise here that is only in the
 * terms or the plan.
 *
 * Paths are relative to the repo root.
 */
export interface TrustClaim {
  title: string;
  body: string;
  enforcedBy: readonly string[];
}

export const TRUST_CLAIMS: readonly TrustClaim[] = [
  {
    title: "Your answers are private to you",
    body: "What you write is encrypted before it is stored, bound to your account and the site you wrote it on. Only Akana's secure server can unlock it, and only to show it to you. There is no screen or tool that shows your answers to an author, a publisher, a reading buddy or Akana staff.",
    enforcedBy: ["packages/seal/src/index.ts", "apps/web/lib/sealing.ts", "supabase/migrations/0003_answers.sql"],
  },
  {
    title: "No ad pixels or third-party trackers",
    body: "The site loads scripts from Akana only. The one exception is Stripe's payment page. A check in every build fails if any other script source is added.",
    enforcedBy: ["apps/web/next.config.ts", "scripts/check-csp.mjs", "apps/web/e2e/third-party.spec.ts"],
  },
  {
    title: "Only the cookies we need",
    body: "We set the cookies that keep you signed in and the site secure, and nothing else. That is why there is no cookie banner.",
    enforcedBy: ["apps/web/lib/supabase/server.ts", "apps/web/lib/supabase/proxy.ts"],
  },
  {
    title: "Emails never name your workbook",
    body: "Our emails to you, and to a check-in partner, never include a workbook's title, Theme or stage name. Tests fail if a template tries.",
    enforcedBy: ["packages/emails/src/reader.ts", "packages/emails/src/reader.test.ts", "packages/emails/src/partner.test.ts"],
  },
  {
    title: "Consent before health information",
    body: "Before your first wellbeing workbook opens, we ask for your explicit consent to store what you write. If you withdraw it, new answers in wellbeing workbooks are not saved. If the wording changes, we ask again.",
    enforcedBy: ["supabase/migrations/0006_consent.sql", "apps/web/lib/consent.ts"],
  },
  {
    title: "Help now, one tap away",
    body: "Every screen of a wellbeing workbook has a Help now button. It opens free support lines where you live, with no sign-in in the way.",
    enforcedBy: ["apps/web/components/HelpNowButton.tsx", "apps/web/app/help-now/page.tsx", "apps/web/e2e/help-now.spec.ts"],
  },
  {
    title: "Adults only",
    body: "You confirm you are 18 or over before any workbook opens. We do not ask for your date of birth.",
    enforcedBy: ["apps/web/app/(reader)/layout.tsx", "apps/web/app/(auth)/welcome/action.ts"],
  },
  {
    title: "Demo titles cannot be bought",
    body: "Demo workbooks carry a Demo label. Checkout refuses them, and they are never part of membership.",
    enforcedBy: ["apps/web/app/api/checkout/route.ts", "supabase/migrations/0010_membership_settings.sql"],
  },
  {
    title: "A record of the terms you agreed to",
    body: "We record which version of the reader terms you agreed to, and when: at sign-up, at checkout and whenever the terms change. If they change, we ask you again before you carry on.",
    enforcedBy: ["supabase/migrations/0018_terms_acceptance.sql", "apps/web/lib/terms.ts"],
  },
  {
    title: "Your work is yours to take or delete",
    body: "You can download everything you wrote at any time. If you delete your account, it is deleted 7 days later, and your name and contact details are cleared from our payment provider. Purchase records are kept because tax law requires it. They do not include your work.",
    enforcedBy: ["apps/web/app/api/export/route.ts", "apps/web/lib/account.ts", "apps/web/lib/account-complete.ts", "supabase/migrations/0007_account_rights.sql"],
  },
  {
    title: "Check-in partners see a stage number only",
    body: "A check-in partner never sees your answers, the workbook, its Theme or its stage names. Wellbeing progress is shared only if you tick the box.",
    enforcedBy: ["supabase/migrations/0012_checkin_partners.sql", "packages/emails/src/partner.test.ts"],
  },
];

/** Things the product does not ask for or receive. Each is true of the code today. */
export const NEVER_COLLECT: readonly TrustClaim[] = [
  {
    title: "Your card number",
    body: "Payments happen on Stripe's page. Akana never receives your full card number.",
    enforcedBy: ["apps/web/app/api/checkout/route.ts"],
  },
  {
    title: "Your date of birth",
    body: "We ask only that you confirm you are 18 or over.",
    enforcedBy: ["apps/web/app/(auth)/welcome/action.ts"],
  },
  {
    title: "Advertising identifiers",
    body: "There are no ad networks, pixels or analytics scripts on the site to collect them.",
    enforcedBy: ["apps/web/next.config.ts", "scripts/check-csp.mjs"],
  },
  {
    title: "A password",
    body: "You sign in with a link sent to your email, so there is no password to store or leak.",
    enforcedBy: ["apps/web/app/(auth)/sign-in/action.ts"],
  },
];

/**
 * The comparison on /trust (11.1): what Akana never does that other apps do.
 * "Others" is deliberately general. No product is named. Each Akana line is
 * something the code, a test or a build check enforces, and names where.
 * lib/trust.test.ts checks the files exist.
 */
export interface TrustComparison {
  practice: string;
  others: string;
  akana: string;
  enforcedBy: readonly string[];
}

export const TRUST_COMPARISON: readonly TrustComparison[] = [
  {
    practice: "Trackers",
    others: "Load ad pixels, analytics scripts and session recorders from other companies, which follow you from site to site.",
    akana: "Loads scripts from Akana only. Stripe's payment page is the one outside page you reach, and only when you pay. A check in every build fails if another script source is added.",
    enforcedBy: ["apps/web/next.config.ts", "scripts/check-csp.mjs", "apps/web/e2e/third-party.spec.ts"],
  },
  {
    practice: "Selling your data",
    others: "Share what they learn about you with advertisers and data brokers.",
    akana: "Has no ad network to send anything to, and your answers are private to you, so there is nothing readable to hand over. The privacy notice says we do not sell your data.",
    enforcedBy: ["packages/seal/src/index.ts", "apps/web/next.config.ts", "docs/legal/privacy-notice.md"],
  },
  {
    practice: "Reading your answers",
    others: "Let staff, authors or partners open what you write, often for product research.",
    akana: "Has no screen or tool that shows your answers to an author, a publisher, a reading buddy or Akana staff. Only the secure server can unlock them, and only to show them to you.",
    enforcedBy: ["packages/seal/src/index.ts", "apps/web/lib/sealing.ts", "supabase/migrations/0003_answers.sql"],
  },
  {
    practice: "Countdowns and made-up scarcity",
    others: "Run timers, show crossed-out prices, or say a deal ends soon or stock is low.",
    akana: "Shows no countdown timer and no crossed-out price. A seasonal launch shows its dates. A price is the price you pay, with every charge in it.",
    enforcedBy: ["apps/web/components/reader/paywall.test.ts", "apps/web/lib/price-display.test.ts", "docs/REVIEW_GATE.md"],
  },
  {
    practice: "Dark patterns",
    others: "Pre-tick boxes, bundle several consents into one, shame you for missing a day, or reward streaks.",
    akana: "Never pre-ticks a box, and asks for each consent on its own. Workbooks that count streaks or missed days fail our checks and are not published. Emails never name your workbook.",
    enforcedBy: ["apps/web/lib/checkout-consent.ts", "packages/validate/src/index.ts", "packages/emails/src/reader.test.ts", "docs/REVIEW_GATE.md"],
  },
];

/** The analytics id rule, stated on /trust and enforced in lib/visitor-id.ts. */
export const ANALYTICS_RULE = {
  title: "How we count visits",
  body: "We count visits to see which pages help people, with no cookie and no profile. A visitor gets an id that is made from a secret, the date and their connection, then hashed. The date is part of the hash, so the id changes every day and one day can never be joined to the next. The ids are deleted when the day ends, and we keep only the counts. Counts under five are not shown.",
  enforcedBy: ["apps/web/lib/visitor-id.ts", "apps/web/lib/funnel.ts"],
} as const;

/** The export promise, stated on /trust. */
export const EXPORT_PROMISE = {
  title: "Your work leaves with you",
  body: "You can download everything you wrote, as a data file or as a page you can print, at any time from your account. It does not depend on being a member. If you ask us to delete your account, it is deleted 7 days later.",
  enforcedBy: ["apps/web/app/api/export/route.ts", "apps/web/lib/account.ts"],
} as const;

/**
 * The public status page address from STATUS_PAGE_URL. Blank, missing or
 * anything other than an https address gives null, and /trust hides the link.
 */
export function statusPageUrl(env: Record<string, string | undefined> = process.env): string | null {
  const raw = env.STATUS_PAGE_URL?.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}
