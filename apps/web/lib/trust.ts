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
    title: "Your answers are sealed",
    body: "What you write is encrypted before it is stored, bound to your account and the site you wrote it on. Only Akana's secure server can unlock it, and only to show it to you. There is no screen or tool that shows your answers to an author, a publisher, a check-in partner or Akana staff.",
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
