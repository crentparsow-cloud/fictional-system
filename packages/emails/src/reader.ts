// Every email a reader (or their check-in partner) can receive.
//
// Invariants, each enforced here and in reader.test.ts:
//  - No workbook or book title. Props accept a themeName and never a title.
//    Keys that look like a title are refused at runtime as well as by the type.
//  - Nothing identifying in subjects: a subject never carries the theme, an
//    email address or any workbook wording. Subjects are fixed strings, with
//    a date or a check-in partner's first name as the only variable parts.
//  - Mail to a check-in partner names no workbook, no theme and no stage:
//    the stage goes out as a number only ("stage 2 of 4"). partner.test.ts
//    renders every partner template against every title and theme.
//  - Nothing assumes a programme length. Stage names and unit labels come in
//    as props because workbook schema v3 leaves them free.

import { type Email, type FooterKind, type Panel, type Rendered, type StageStrip, BRAND, footerText, render, stageHero } from "./layout";
import type { FooterLinks } from "./layout";

/** A catalogue theme. Reader mail may name a theme in its body, never a title. */
export type Theme = { id: string; name: string };

/** Props shared by every reader template. The never fields stop a title arriving under any likely name. */
export type ReaderBase = {
  /** The reader's first name, if they gave one. */
  name?: string;
  appUrl: string;
  settingsUrl: string;
  supportEmail: string;
  /** The theme of the reader's workbook, for bodies only. */
  themeName?: string;
  title?: never;
  shortTitle?: never;
  workbookTitle?: never;
  bookTitle?: never;
  workbookName?: never;
};

type Stage = { stageLabels: string[]; stageIndex: number };
type Partner = { readerName: string; partnerName?: string; shareLevel: 1 | 2 | 3 };
/** Where a reader is, as numbers only. Stage labels are accepted for the older shape but never rendered to a partner. */
type StagePosition = Stage | { stageNumber: number; stageCount: number };
type MembershipTerms = { price: string; periodWords: string; nextDate: string };

export type ReaderProps = {
  welcome: ReaderBase & { firstUnitLabel?: string };
  first_unit_finished: ReaderBase & { firstUnitLabel?: string };
  purchase_lifetime: ReaderBase & { offerName: string; price: string };
  purchase_membership: ReaderBase & MembershipTerms;
  renewal_notice: ReaderBase & { renewDate: string; price: string };
  /**
   * The day-zero email after a membership trial starts (14.20): the first
   * week's plan, as unit names only, then the trial dates. It is not a
   * receipt. planItems come from the workbook's public outline and are
   * never the workbook or book title.
   */
  trial_started: ReaderBase & {
    trialLength: string;
    reminderDate: string;
    firstPaymentDate: string;
    price: string;
    periodWords: string;
    planHeading?: string;
    planItems?: string[];
  };
  /** Three days before a trial converts: the first payment date, the amount and how to cancel. */
  trial_ending: ReaderBase & { firstPaymentDate: string; price: string; periodWords: string };
  membership_terms_reminder: ReaderBase & MembershipTerms;
  membership_away: ReaderBase & { price: string; nextDate: string };
  payment_failed: ReaderBase & { price?: string };
  cancellation: ReaderBase & { cancelMode: "immediate" | "period_end"; endDate?: string; refundAmount?: string; refundStatus?: "pending" | "succeeded" | "failed" };
  account_deleted: ReaderBase & { deletionDate?: string; undoUrl?: string; refundAmount?: string; refundStatus?: "pending" | "succeeded" | "failed" };
  export_code: ReaderBase & { code: string; expiresMinutes?: number };
  partner_accepted: ReaderBase & { partnerName?: string; shareLevel?: 1 | 2 | 3 };
  passkey_added: ReaderBase & { when: string; device: string };
  password_changed: ReaderBase & { when: string; device: string };
  email_changed: ReaderBase & { when: string; device: string; newEmail?: string };
  history_downloaded: ReaderBase & { when: string; device: string };
  stage_complete: ReaderBase & Stage & { nextStepLabel?: string };
  inactive_7: ReaderBase & { nextStep?: string };
  inactive_14: ReaderBase;
  inactive_30: ReaderBase;
  maintenance: ReaderBase & { questions?: [string, string] };
  crosssell_general: ReaderBase & { storeUrl?: string };
  crosssell_personal: ReaderBase & { suggestions: { themeName: string; line: string }[]; storeUrl?: string };
  new_workbook_available: ReaderBase & { themeName: string; line?: string; storeUrl?: string };
  partner_invite: ReaderBase & Partner & { acceptUrl: string; declineUrl: string };
  partner_update: ReaderBase & Partner & StagePosition & { note?: string; replyUrl?: string };
  partner_stopped: ReaderBase & Omit<Partner, "shareLevel"> & { stoppedBy?: "reader" | "partner" };
  /** A single-workbook refund made by Akana staff (0021 refund path). Names no title. */
  refund_confirmed: ReaderBase & { amount: string; accessEnded: boolean };
  /** Akana support cancelled a pending account deletion for the reader (F-087). */
  deletion_cancelled: ReaderBase;
  /**
   * A reminder the reader set up themselves (4.7). The step is named by its
   * unit name, never the workbook title. subjectLabel is what follows
   * "Akana today:" in the subject: the unit name, or just "Week 3" for a
   * wellbeing title. No line about anything missed.
   */
  step_reminder: ReaderBase & { stepName: string; unitWords: string; subjectLabel: string; minutes?: number; stepUrl: string };
  /** The one email that says the reminders are stopping (14.3), and how to start them again. */
  reminders_stopping: ReaderBase & { remindersUrl: string };
  /** One plain note after a long gap (4.9), to a reader who asked for reminders. No offer, no discount. */
  welcome_back: ReaderBase & { stepUrl: string };
};
export type ReaderTemplateName = keyof ReaderProps;

const v = (x: unknown, fallback = "") => (x === undefined || x === null || x === "" ? fallback : String(x));
const hi = (name: unknown) => (v(name) ? `Hi ${v(name)},` : "Hello,");
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

// "a single workbook" -> "Single workbook"
const offerLabel = (s: string) => {
  const t = s.replace(/^(a|an|the)\s+/i, "");
  return t ? t[0]!.toUpperCase() + t.slice(1) : "Your purchase";
};
const membershipLabel = (periodWords: string) => (/year/.test(periodWords) ? "Annual membership" : "Monthly membership");

/** Where a reader cancels, in the words the app uses: the You page, then the Manage membership button. */
export const CANCEL_PATH = "go to You, then Manage membership, then Cancel";

const HOW_TO_CANCEL: Panel = {
  title: "How to cancel",
  lines: [`To cancel, ${CANCEL_PATH}. No questions asked. You keep access until the end of the period you have paid for.`],
  tone: "tint",
};

const REFUND_STATUS: Record<string, string> = {
  pending: "On its way",
  succeeded: "Sent",
  failed: "Delayed, and being retried",
};
function refundPanel(amount?: string, status?: string): Panel[] {
  if (!amount) return [];
  return [
    {
      title: "Your refund",
      rows: [
        ["Amount", amount],
        ["Status", REFUND_STATUS[status ?? "pending"] ?? REFUND_STATUS.pending!],
      ],
      lines: ["It goes back to the card you paid with. Refunds can take several business days to show on your statement."],
      tone: "tint",
    },
  ];
}

const securityNote = (x: ReaderBase & { when: string; device: string }, what: string, when: string): Email => ({
  subject: what,
  preheader: "If this was you, there's nothing to do.",
  hero: "service",
  eyebrow: "Account security",
  headline: what,
  greeting: hi(x.name),
  paragraphs: [when],
  panels: [
    {
      rows: [
        ["When", v(x.when, "[time]")],
        ["Device", v(x.device, "[device type]")],
      ],
      tone: "tint",
    },
  ],
  after: ["If this was you, there's nothing to do.", `If it was not you, review your sign-in settings and contact support at ${x.supportEmail} right away.`],
  buttons: [{ label: "Review your account", url: x.settingsUrl }],
  footer: "service",
});

const strip = (s: Stage): StageStrip => ({ labels: s.stageLabels, upTo: s.stageIndex });
const stageLabel = (s: Stage) => s.stageLabels[s.stageIndex] ?? "this";
const isLastStage = (s: Stage) => s.stageIndex >= s.stageLabels.length - 1;
const nextStageLabel = (s: Stage) => s.stageLabels[s.stageIndex + 1];
/** Stage number (from 1) and count, from either shape. Never a label. */
const stagePosition = (s: StagePosition): { number: number; count: number } => {
  const raw = "stageNumber" in s ? { number: s.stageNumber, count: s.stageCount } : { number: s.stageIndex + 1, count: s.stageLabels.length };
  const count = Math.max(1, Math.floor(Number(raw.count) || 1));
  return { number: Math.min(count, Math.max(1, Math.floor(Number(raw.number) || 1))), count };
};

const minutesPhrase = (n: unknown) => {
  const m = Math.floor(Number(n));
  return Number.isFinite(m) && m > 0 ? `About ${m} ${m === 1 ? "minute" : "minutes"}.` : "";
};

export const READER_TEMPLATES: { [K in ReaderTemplateName]: (props: ReaderProps[K]) => Email } = {
  // ---------- account and service ----------
  welcome: (x) => {
    const unit = v(x.firstUnitLabel, "Week one");
    return {
      subject: "Your first step is ready",
      preheader: "One exercise, one check-in and a tool for tonight.",
      hero: "stage-1",
      eyebrow: "Your free start",
      headline: `${unit} is open`,
      greeting: hi(x.name),
      paragraphs: [`Your workbook is set up. ${unit} is open now, it's free, and it won't turn into a paid plan on its own.`],
      panels: [
        {
          title: "To begin with",
          items: [
            "One exercise, with a short version for low-energy days.",
            "One check-in at the end.",
            "A tool already in your Toolkit. It takes about a minute. Try it tonight if you need it.",
          ],
          tone: "stage-1",
        },
      ],
      after: ["Go at your own pace. Missed days leave no mark."],
      buttons: [{ label: `Open ${lower(unit)}`, url: x.appUrl }],
      footer: "service",
    };
  },

  first_unit_finished: (x) => {
    const unit = v(x.firstUnitLabel, "Week one");
    return {
      subject: "You finished your first step",
      preheader: "Nothing was charged. Your answers are saved.",
      hero: "stage-1",
      eyebrow: "Free start complete",
      headline: `You finished ${lower(unit)}`,
      greeting: hi(x.name),
      paragraphs: [
        `${unit} is done, and nothing was charged. Your free start does not turn into a paid plan on its own.`,
        "Your answers are saved. If you'd like to carry on, the app shows the ways to keep going. If you stop here, nothing else happens.",
      ],
      buttons: [{ label: "See your options", url: x.appUrl }],
      footer: "service",
    };
  },

  purchase_lifetime: (x) => ({
    subject: "Your purchase is confirmed",
    preheader: "It's open in your account now, and it's yours for life.",
    hero: "service",
    eyebrow: "Purchase confirmed",
    headline: "Thank you. It's open now.",
    greeting: hi(x.name),
    paragraphs: ["Everything you bought is open in your account now, and it's yours for life."],
    panels: [
      {
        title: "Your purchase",
        rows: [
          ["Item", offerLabel(x.offerName)],
          ["Price", x.price],
          ["Access", "Lifetime"],
        ],
        tone: "tint",
      },
      {
        title: "What you agreed at checkout",
        lines: ["You asked for access to start right away. Because access has started, the 14-day right to cancel and get a refund no longer applies."],
        tone: "terms",
      },
    ],
    after: ["Your receipt comes in a separate email from our payment provider. Keep this email as your record of the terms."],
    buttons: [{ label: "Open your workbook", url: x.appUrl }],
    footer: "service",
  }),

  purchase_membership: (x) => ({
    subject: "Your membership is confirmed",
    preheader: "Your membership terms, and how to cancel.",
    hero: "service",
    eyebrow: "Membership confirmed",
    headline: "Your membership is active",
    greeting: hi(x.name),
    paragraphs: ["Thank you. Every workbook in the membership is open in your account now."],
    panels: [
      {
        title: "Your membership",
        rows: [
          ["Plan", membershipLabel(x.periodWords)],
          ["Price", `${x.price} ${x.periodWords}`.trim()],
          ["Renews", "Automatically, until you cancel"],
          ["Next payment", x.nextDate],
        ],
        tone: "tint",
      },
      {
        title: "What you agreed at checkout",
        lines: [
          "You asked for access to start right away. If you cancel within 14 days, you get a refund for the time you have not used.",
          "You also agreed that the membership renews automatically until you cancel.",
        ],
        tone: "terms",
      },
      HOW_TO_CANCEL,
    ],
    after: ["Your receipt comes in a separate email from our payment provider."],
    buttons: [
      { label: "Open your workbooks", url: x.appUrl },
      { label: "Manage membership", url: x.settingsUrl },
    ],
    footer: "service",
  }),

  // The day-zero email after a trial starts (14.20). Leads with the first
  // week's plan, unit names only, never a workbook title. The trial dates and
  // the way to cancel follow. It says nothing is taken today and never calls
  // the trial free. Not a receipt: Stripe sends no receipt for a nil invoice.
  trial_started: (x) => {
    const items = (x.planItems ?? []).filter((i) => i.trim());
    const panels: Panel[] = [];
    if (items.length) panels.push({ title: x.planHeading ?? "Your first week", items, tone: "tint" });
    panels.push(
      {
        title: "Your trial",
        rows: [
          ["Trial length", x.trialLength],
          ["Reminder email", x.reminderDate],
          ["First payment", `${x.firstPaymentDate}, ${x.price} ${x.periodWords}`.trim()],
          ["After that", `${x.price} ${x.periodWords}, automatically, until you cancel`.trim()],
        ],
        tone: "terms",
      },
      HOW_TO_CANCEL,
    );
    return {
      subject: "Your first week is ready",
      preheader: items.length ? "Here is what the first week looks like." : "Your trial dates, and how to cancel.",
      hero: "service",
      eyebrow: "Your membership trial",
      headline: items.length ? "Here is your first week" : "Your trial has started",
      greeting: hi(x.name),
      paragraphs: [
        items.length
          ? "Your trial has started and everything in the membership is open. This is how your first week is laid out. Take it one step at a time."
          : "Your trial has started and everything in the membership is open. Pick up where you like.",
        `Nothing is taken today. We email you a reminder on ${x.reminderDate}, before your first payment on ${x.firstPaymentDate}.`,
      ],
      panels,
      after: ["If you cancel before the first payment, you are not charged."],
      buttons: [
        { label: "Open your first step", url: x.appUrl },
        { label: "Manage membership", url: x.settingsUrl },
      ],
      equalButtons: true,
      footer: "service",
    };
  },

  // Three days before a trial converts. Names no title. States the date and
  // the amount, and how to cancel without being charged.
  trial_ending: (x) => ({
    subject: `Your trial ends on ${x.firstPaymentDate}`,
    preheader: "Nothing to do if you want to keep your membership.",
    hero: "service",
    eyebrow: "Trial reminder",
    headline: "Your trial ends soon",
    greeting: hi(x.name),
    paragraphs: ["Your membership trial is nearly over. Here is when your first payment is taken, and what it is."],
    panels: [{ title: "First payment", big: x.firstPaymentDate, rows: [["Amount", `${x.price} ${x.periodWords}`.trim()]], tone: "service" }],
    after: [
      "If you want to keep your membership, you do not need to do anything.",
      `If you want to cancel, ${CANCEL_PATH} before ${x.firstPaymentDate}. You will not be charged.`,
    ],
    buttons: [
      { label: "Keep my membership", url: x.appUrl },
      { label: "Manage membership", url: x.settingsUrl },
    ],
    equalButtons: true,
    footer: "service",
  }),

  // The reminder before an annual renewal. It names no title, and says the
  // date, the amount and how to cancel.
  renewal_notice: (x) => ({
    subject: `Your membership renews on ${x.renewDate}`,
    preheader: "Nothing to do if you want to keep it.",
    hero: "service",
    eyebrow: "Renewal reminder",
    headline: "Your membership renews soon",
    greeting: hi(x.name),
    paragraphs: ["Your annual membership renews automatically. Here is when, and what it costs."],
    panels: [{ title: "Renews on", big: x.renewDate, rows: [["Amount", x.price]], tone: "service" }],
    after: [
      "If you want to keep it, you do not need to do anything.",
      `If you want to cancel, ${CANCEL_PATH} before ${x.renewDate}. You will not be charged again, and you keep access until that date.`,
    ],
    buttons: [
      { label: "Keep my membership", url: x.appUrl },
      { label: "Manage membership", url: x.settingsUrl },
    ],
    equalButtons: true,
    footer: "service",
  }),

  // The six-monthly reminder for a monthly member (DMCC subscription regime).
  // It names no title, and says the price, how often they pay, the next
  // payment date and how to cancel.
  membership_terms_reminder: (x) => {
    const often = /year/.test(x.periodWords) ? "Every year" : "Every month";
    return {
      subject: "A reminder of your membership terms",
      preheader: "What you pay, how often, and how to cancel.",
      hero: "service",
      eyebrow: "Your membership",
      headline: "Your membership terms, in one place",
      greeting: hi(x.name),
      paragraphs: [
        `Your membership renews automatically until you cancel. You pay ${`${x.price} ${x.periodWords}`.trim()}. Your next payment is on ${x.nextDate}.`,
        "We send this reminder every six months, so you always know what you pay and how to stop.",
      ],
      panels: [
        {
          rows: [
            ["Plan", membershipLabel(x.periodWords)],
            ["Price", `${x.price} ${x.periodWords}`.trim()],
            ["How often", `${often}, automatically, until you cancel`],
            ["Next payment", x.nextDate],
          ],
          tone: "tint",
        },
        HOW_TO_CANCEL,
      ],
      after: [`If you cancel before ${x.nextDate}, you will not be charged again. If you want to keep your membership, there is nothing to do.`],
      buttons: [{ label: "Manage membership", url: x.settingsUrl }],
      footer: "service",
    };
  },

  membership_away: (x) => ({
    subject: "Your membership while you're away",
    preheader: "Your membership is still active while you take a break.",
    hero: "service",
    eyebrow: "Your membership",
    headline: "Your membership is still active",
    greeting: hi(x.name),
    paragraphs: ["Your membership is still active while you take a break, so here is a quick note on what that means."],
    panels: [
      {
        rows: [
          ["Price", x.price],
          ["Next renewal", x.nextDate],
        ],
        tone: "tint",
      },
    ],
    after: [
      `If you're taking a longer break, ${CANCEL_PATH}. You keep access until then, and everything you wrote stays in your account.`,
      "If you plan to come back soon, there's nothing to do.",
    ],
    buttons: [{ label: "Manage membership", url: x.settingsUrl }],
    footer: "service",
  }),

  payment_failed: (x) => ({
    subject: "Your payment didn't go through",
    preheader: "A quick check of your payment details should fix it.",
    hero: "service",
    eyebrow: "Your membership",
    headline: "Your payment didn't go through",
    greeting: hi(x.name),
    paragraphs: [
      `The latest payment for your membership${x.price ? ` (${x.price})` : ""} did not go through. This often happens when a card expires or a bank declines a payment.`,
      "Please check your payment details. Go to You, then Manage membership. Your membership carries on while we try the payment again over the next two weeks.",
      "If it still does not go through by then, your membership ends. Everything you wrote stays in your account.",
    ],
    buttons: [{ label: "Update payment details", url: x.settingsUrl }],
    footer: "service",
  }),

  cancellation: (x) => {
    const now = x.cancelMode === "immediate";
    const refund = refundPanel(x.refundAmount, x.refundStatus);
    const endDate = v(x.endDate, "the end of your period");
    return {
      subject: "Your membership is cancelled",
      preheader: now ? (refund.length ? "Your membership has ended, and your refund is on its way." : "Your membership has ended.") : `You keep access until ${endDate}.`,
      hero: "service",
      eyebrow: "Cancellation confirmed",
      headline: "Your membership is cancelled",
      greeting: hi(x.name),
      paragraphs: now
        ? ["Your membership has ended today, and no further payments will be taken.", ...(refund.length ? ["You cancelled within 14 days of your membership starting, so the time you have not used is refunded."] : [])]
        : ["Your membership will not renew, and no further payments will be taken."],
      panels: now ? refund : [{ title: "Access until", big: endDate, tone: "service" }, ...refund],
      after: [
        now
          ? "Everything you wrote stays in your account. You can still read all of it, and download it anytime from the You page."
          : "Everything you wrote stays in your account. You can download it anytime from the You page.",
      ],
      buttons: [
        { label: "Open your workbooks", url: x.appUrl },
        { label: "Download your answers", url: x.settingsUrl },
      ],
      footer: "service",
    };
  },

  // Sent when a deletion is scheduled. The finished deletion sends the shorter version.
  account_deleted: (x) => {
    if (!(x.undoUrl && x.deletionDate)) {
      return {
        subject: "Your account is deleted",
        preheader: "This cannot be undone.",
        hero: "service",
        eyebrow: "Account deletion",
        headline: "Your account is deleted",
        greeting: hi(x.name),
        paragraphs: [
          `Your ${BRAND} account and everything you wrote in it have been deleted. This cannot be undone.`,
          "Only what the law requires is kept: a record of any purchase and of the consents you gave, for six years.",
          "If you had a membership, it has been cancelled and will not renew.",
        ],
        after: [`If you did not ask for this, contact support at ${x.supportEmail} right away.`],
        footer: "deleted",
      };
    }
    return {
      subject: `Your account will be deleted on ${x.deletionDate}`,
      preheader: "You can undo this until then.",
      hero: "service",
      eyebrow: "Account deletion",
      headline: "Your account is set to be deleted",
      greeting: hi(x.name),
      paragraphs: [
        `You asked to delete your ${BRAND} account. On the date below, your account and everything you wrote in it will be deleted.`,
        "Until then, your account is read-only. If you had a membership, it will be cancelled on that date and billing will stop. If that date is within 14 days of your membership starting, or of an annual renewal, the time you have not used is refunded.",
      ],
      panels: [{ title: "Deletion date", big: x.deletionDate, tone: "service" }, ...refundPanel(x.refundAmount, x.refundStatus)],
      after: [
        "Changed your mind? Undo it before that date and your account and answers will stay.",
        "If you would like a copy of your answers, download it from the You page before that date.",
        "After that date, the deletion cannot be undone. Only what the law requires is kept: a record of any purchase and of the consents you gave, for six years.",
        `If you did not ask for this, undo it now and contact support at ${x.supportEmail}.`,
      ],
      buttons: [
        { label: "Undo deletion", url: x.undoUrl },
        { label: "Download your answers", url: x.settingsUrl },
      ],
      footer: "deleted",
    };
  },

  export_code: (x) => ({
    subject: "Your code to download your answers",
    preheader: "It works once, for a short time.",
    hero: "service",
    eyebrow: "Account security",
    headline: "Your download code",
    greeting: hi(x.name),
    paragraphs: [`Enter this code in ${BRAND} to download a copy of your answers.`],
    panels: [{ big: x.code, spaced: true, lines: [`It works once, and expires in ${x.expiresMinutes ?? 10} minutes.`], tone: "service" }],
    after: ["If you did not ask for this code, you can ignore this email. Nobody can download your answers without it."],
    footer: "service",
  }),

  partner_accepted: (x) => {
    const who = v(x.partnerName, "Your check-in partner");
    const level = Number(x.shareLevel ?? 1);
    return {
      subject: "Your check-in partner said yes",
      preheader: "They'll get a short note when you reach a new stage.",
      hero: "partner",
      eyebrow: "Your check-in partner",
      headline: `${who} said yes`,
      greeting: hi(x.name),
      paragraphs: [`${who} will get a short note when you reach a new stage, and never more than once a week.`],
      panels: [
        {
          title: "What they see",
          items: [
            "That you reached a new stage.",
            ...(level >= 2 ? ["A gentle question they could ask you."] : []),
            ...(level >= 3 ? ["Your short note, if you write one."] : []),
          ],
          lines: ["They never see your answers, what you write, or which workbook you're using."],
          tone: "tint",
        },
      ],
      after: ["You can change what they see, or stop sharing, at any time on the You page."],
      buttons: [{ label: "Check-in partner settings", url: x.settingsUrl }],
      footer: "service",
    };
  },

  passkey_added: (x) => securityNote(x, "A passkey was added to your account", `A new passkey was just added to your ${BRAND} account. You can now use it to sign in.`),
  password_changed: (x) => securityNote(x, "Your password was changed", `The password for your ${BRAND} account was just changed.`),
  email_changed: (x) =>
    securityNote(
      x,
      "Your email address was changed",
      `The email address for your ${BRAND} account was changed${x.newEmail ? ` to ${x.newEmail}` : ""}. This note goes to your old address, so you know.`,
    ),
  history_downloaded: (x) =>
    securityNote(x, "Your answers were downloaded", `A copy of your answers was just downloaded from your ${BRAND} account. Nothing is attached to this email.`),

  // ---------- progress (needs the progress email opt-in) ----------
  stage_complete: (x) => {
    const label = stageLabel(x);
    const last = isLastStage(x);
    const next = nextStageLabel(x);
    const count = x.stageLabels.length;
    return {
      subject: "You finished a stage",
      preheader: last ? "Your plan is saved, and so is the way back when it slips." : "Here's what comes next.",
      hero: stageHero(x.stageIndex),
      eyebrow: `${label} stage`,
      headline: last ? "You finished the whole workbook" : `You finished the ${label} stage`,
      badge: last ? "All stages complete" : `Stage ${x.stageIndex + 1} of ${count} complete`,
      strip: strip(x),
      greeting: hi(x.name),
      paragraphs: [
        last
          ? "You worked through every stage and tested what you built on real life. Your plan and your way back after a hard patch are saved in My Plan."
          : `The ${label} stage is done. What you wrote there is saved, and the next stage builds on it.`,
      ],
      panels: [
        last
          ? {
              title: "What happens now",
              lines: [
                "It won't run perfectly, and it doesn't have to. When it slips, your plan is the way back.",
                "Once a month you'll get two short questions to help it stick. You can turn them off in Email settings.",
              ],
              tone: "tint",
            }
          : {
              title: `Next: ${next}`,
              lines: ["Small, practical steps, one at a time. Some of it won't work the first time. When that happens, change the system, not your opinion of yourself."],
              tone: stageHero(x.stageIndex + 1),
            },
      ],
      buttons: [{ label: v(x.nextStepLabel, last ? "Open My Plan" : "Open the next step"), url: x.appUrl }],
      footer: "progress",
    };
  },

  inactive_7: (x) => ({
    subject: "Your next step is small",
    preheader: "Your workbook is where you left it.",
    hero: "stage-1",
    eyebrow: "Whenever you're ready",
    headline: "Your workbook is where you left it",
    greeting: hi(x.name),
    paragraphs: ["Weeks like that happen. Your next step is ready when you are."],
    panels: [{ title: "Your next step", lines: [v(x.nextStep, "The next exercise"), "On a low-energy day, try the short version."], tone: "tint" }],
    buttons: [{ label: "Pick up where you left off", url: x.appUrl }],
    footer: "progress",
  }),

  inactive_14: (x) => ({
    subject: "One step back is enough",
    preheader: "You don't need to catch up.",
    hero: "stage-1",
    eyebrow: "Whenever you're ready",
    headline: "One small step back",
    greeting: hi(x.name),
    paragraphs: ["You don't need to catch up on anything you missed."],
    panels: [{ title: "Start here", lines: ["Open the Restart card in your Toolkit. It gives you one step to take, and takes about a minute to read."], tone: "tint" }],
    after: ["If this is a busy season, do only the short versions for now. They still count."],
    buttons: [{ label: "Open your Toolkit", url: x.appUrl }],
    footer: "progress",
  }),

  inactive_30: (x) => ({
    subject: "Your plan is saved",
    preheader: "It'll be here whenever you come back.",
    hero: "stage-1",
    eyebrow: "Whenever you're ready",
    headline: "Your plan is saved",
    greeting: hi(x.name),
    paragraphs: [
      "Your answers and your plan are saved, and they'll be here whenever you come back.",
      "When you're ready, one small step is enough. The Restart card in your Toolkit shows you where to begin.",
    ],
    after: ["This is the last reminder for now."],
    buttons: [{ label: "Open your workbook", url: x.appUrl }],
    footer: "progress",
  }),

  maintenance: (x) => ({
    subject: "Two questions for this month",
    preheader: "Two minutes, once a month.",
    hero: "stage-4",
    eyebrow: "Monthly check-in",
    headline: "Two questions for this month",
    greeting: hi(x.name),
    paragraphs: ["Here are this month's two questions. Answer them in your head, on paper or in the app."],
    panels: [
      {
        items: x.questions ?? ["Which part of your plan is working without you having to think about it?", "What slipped this month, and what's one step back?"],
        tone: "stage-4",
      },
    ],
    after: ["Your plan is saved in the app whenever you want it."],
    buttons: [{ label: "Open My Plan", url: x.appUrl }],
    footer: "progress",
  }),

  // ---------- marketing ----------
  crosssell_general: (x) => ({
    subject: "Workbooks, one at a time",
    preheader: "Each one is a run of small, practical steps.",
    hero: "brand",
    eyebrow: `From ${BRAND}`,
    headline: "Workbooks, one at a time",
    greeting: hi(x.name),
    paragraphs: [`Every ${BRAND} workbook is built from a book, runs in small, practical steps, and starts with a free first step.`],
    panels: [
      {
        title: "Ways to get them",
        rows: [
          ["One workbook", "Yours for life"],
          ["A set", "Workbooks that belong together"],
          ["Everything", "The whole library, with a membership"],
        ],
        tone: "tint",
      },
    ],
    buttons: [{ label: "See the workbooks", url: v(x.storeUrl, x.appUrl) }],
    footer: "marketing",
  }),

  crosssell_personal: (x) => {
    // One suggestion per theme, as "Theme: one plain line". A send with no suggestions is refused.
    const list = x.suggestions.map((s) => `${s.themeName}: ${s.line}`.trim()).filter(Boolean);
    if (!list.length) throw new Error("crosssell_personal_needs_suggestions");
    return {
      subject: "Three workbooks you might like",
      preheader: "Chosen from the themes yours belongs to.",
      hero: "brand",
      eyebrow: "Suggested for you",
      headline: "Three workbooks you might like",
      greeting: hi(x.name),
      paragraphs: ["You asked for suggestions based on the workbooks you use. These sit in the same themes as yours, and work the same way."],
      panels: [{ items: list, tone: "tint" }],
      after: ["Each one starts with a free first step."],
      buttons: [{ label: "See the set", url: v(x.storeUrl, x.appUrl) }],
      footer: "marketing",
    };
  },

  new_workbook_available: (x) => ({
    subject: "A new workbook is ready",
    preheader: "The first step is free.",
    hero: "brand",
    eyebrow: `New on ${BRAND}`,
    headline: `A new ${x.themeName} workbook`,
    greeting: hi(x.name),
    paragraphs: [`A new ${x.themeName} workbook is now on ${BRAND}.${x.line ? " " + x.line : ""}`, "Like every workbook, it runs in small steps, and the first step is free."],
    buttons: [{ label: "Take a look", url: v(x.storeUrl, x.appUrl) }],
    footer: "marketing",
  }),

  // ---------- check-in partner ----------
  // Nothing here reads themeName, a stage label or anything else from the
  // reader's work. Only first names, numbers and the reader's own short note.
  partner_invite: (x) => {
    const reader = v(x.readerName, "A friend");
    const level = Number(x.shareLevel);
    return {
      subject: `${reader} would like you as their check-in partner`,
      preheader: "Short updates, only if you say yes.",
      hero: "partner",
      eyebrow: `From ${reader}`,
      headline: `${reader} would like you as their check-in partner`,
      greeting: hi(x.partnerName),
      paragraphs: [
        `${reader} is working through a guided workbook on ${BRAND}, one small step at a time. They'd like you to be their check-in partner. That means a short email now and then, so you can cheer them on.`,
      ],
      panels: [
        {
          title: "What you'd get",
          items: [
            "A short email when they reach a new stage, never more than once a week.",
            ...(level >= 2 ? ["A gentle question you could ask them, if you want to."] : []),
            ...(level >= 3 ? ["Now and then, a short note from them."] : []),
            "A way to send a few kind words back.",
          ],
          tone: "partner",
        },
        {
          title: "What you won't see",
          lines: [
            "You won't see their answers, what they write, or which workbook they're using. You're not being asked to check on them.",
            `${BRAND} is a self-guided workbook, not a medical service. You are not being asked to act as an emergency contact.`,
          ],
          tone: "tint",
        },
      ],
      after: [
        "This invitation lasts 14 days.",
        `You'll never get marketing from ${BRAND}. If you say no, or do nothing, you won't hear from us about this again.`,
      ],
      buttons: [{ label: "Yes, send me updates", url: x.acceptUrl }],
      quietLink: { label: "No, thank you", url: x.declineUrl },
      footer: "partner_invite",
    };
  },

  partner_update: (x) => {
    const reader = v(x.readerName, "Your friend");
    const level = Number(x.shareLevel);
    const { number, count } = stagePosition(x);
    const last = number >= count;
    const note = level >= 3 && x.note ? x.note : "";
    const ask = last ? "What will you keep doing from here?" : "What's been helping lately?";
    const said = count > 1 ? `${reader} has reached stage ${number} of ${count}.` : `${reader} has reached the end of their workbook.`;
    return {
      subject: `An update from ${reader}`, // fixed: the subject never hints at progress or topic
      preheader: level >= 2 ? "Plus one question you could ask them." : "They chose to share this with you.",
      hero: "partner",
      eyebrow: "Check-in partner update",
      headline: last ? `${reader} reached the end` : `${reader} reached a new stage`,
      greeting: hi(x.partnerName),
      paragraphs: [last && count > 1 ? `${reader} has finished the last stage of their workbook. They chose to share this with you.` : `${said} They chose to share this with you.`],
      panels: [
        ...(note ? [{ title: `A note from ${reader}`, quote: note, tone: "tint" as const }] : []),
        ...(level >= 2 ? [{ title: "A question you could ask", lines: [ask], tone: "partner" as const }] : []),
      ],
      after: ["Only if you want to. There's no need to reply to this email.", `Thank you for being there for ${reader}.`],
      ...(x.replyUrl ? { buttons: [{ label: "Send a few kind words", url: x.replyUrl }] } : {}),
      footer: "partner",
    };
  },

  partner_stopped: (x) => {
    const reader = v(x.readerName, "your friend");
    const byReader = x.stoppedBy === "reader";
    return {
      subject: "Your updates have stopped",
      preheader: "Thank you for being there.",
      hero: "partner",
      eyebrow: "Check-in partner",
      headline: "Your updates have stopped",
      greeting: hi(x.partnerName),
      paragraphs: byReader
        ? [
            `${reader} has stopped sharing updates, so you won't get any more. This happens for all sorts of reasons, and it isn't something you did.`,
            "The links in earlier emails no longer work.",
            `Thank you for being there for ${reader}.`,
          ]
        : [`You won't get any more updates about ${reader}. They can see in the app that updates have stopped.`, `Thank you for being there for ${reader}.`],
      footer: "partner_stopped",
    };
  },

  // A refund of a single workbook, sent once per refund from the staff
  // refund path. It names no title: the reader knows what they bought.
  refund_confirmed: (x) => ({
    subject: "Your refund is on its way",
    preheader: "We have refunded your payment.",
    hero: "service",
    eyebrow: "Refund",
    headline: "Your refund is on its way",
    greeting: hi(x.name),
    paragraphs: ["We have refunded a payment you made for a workbook on Akana."],
    panels: [
      {
        title: "Your refund",
        rows: [
          ["Amount", x.amount],
          ["Access", x.accessEnded ? "Ended with the refund" : "You keep your access"],
        ],
        lines: ["It goes back to the card you paid with. Refunds can take several business days to show on your statement."],
        tone: "tint",
      },
    ],
    after: [
      "Your answers are still yours. You can download them from the You page at any time.",
      `If you have a question about this refund, reply to this email${x.supportEmail ? ` or write to ${x.supportEmail}` : ""}.`,
    ],
    buttons: [{ label: "Go to your account", url: x.settingsUrl }],
    footer: "service",
  }),

  // Support cancelled a deletion on the reader's behalf. The reader asked us
  // to, so this confirms it, and says what to do if they did not.
  step_reminder: (x) => ({
    subject: `Akana today: ${x.subjectLabel}`,
    preheader: "Your step is ready when you are.",
    hero: "stage-1",
    eyebrow: "Your reminder",
    headline: "Your step for today",
    greeting: hi(x.name),
    paragraphs: ["You asked us to remind you on days like this one. Your step is ready when you are."],
    panels: [{ title: x.unitWords, lines: [x.stepName, minutesPhrase(x.minutes)].filter(Boolean), tone: "tint" }],
    buttons: [{ label: "Open today's step", url: x.stepUrl }],
    quietLink: { label: "Change or stop these reminders", url: x.settingsUrl },
    footer: "reminder",
  }),

  reminders_stopping: (x) => ({
    subject: "We are stopping your reminders",
    preheader: "No action needed. You can start them again any time.",
    hero: "stage-1",
    eyebrow: "Your reminders",
    headline: "We are stopping your reminders",
    greeting: hi(x.name),
    paragraphs: [
      "We have sent a few reminders and have not heard back, so we are stopping them. That is fine. Nothing else changes.",
      "Your work is saved. Whenever you want reminders again, turn them on in You, choose your days and time, and they will start from the next day you pick.",
    ],
    buttons: [{ label: "Turn reminders back on", url: x.remindersUrl }],
    footer: "reminder",
  }),

  welcome_back: (x) => ({
    subject: "Welcome back",
    preheader: "Your place is saved. One easy step is waiting.",
    hero: "stage-1",
    eyebrow: "Whenever you are ready",
    headline: "Welcome back",
    greeting: hi(x.name),
    paragraphs: ["Your place is saved. There is one easy step waiting, and it is a small one."],
    buttons: [{ label: "See where you were", url: x.stepUrl }],
    quietLink: { label: "Change or stop these emails", url: x.settingsUrl },
    footer: "reminder",
  }),

  deletion_cancelled: (x) => ({
    subject: "Your account will not be deleted",
    preheader: "We cancelled the deletion you asked us to stop.",
    hero: "service",
    eyebrow: "Account deletion",
    headline: "Your account is staying",
    greeting: hi(x.name),
    paragraphs: [
      `You asked us to stop the deletion of your ${BRAND} account, so we have cancelled it. Your account, your answers and anything you bought are as they were.`,
      "You can ask for deletion again at any time from the You page.",
    ],
    after: [`If you did not ask for this, contact us${x.supportEmail ? ` at ${x.supportEmail}` : ""} and we will look into it straight away.`],
    buttons: [{ label: "Go to your account", url: x.settingsUrl }],
    footer: "service",
  }),
};

// ---------- sign-in emails (pasted into Supabase, not sent by the app) ----------
// Keep {{ .ConfirmationURL }} and {{ .SiteURL }} exactly as written.
const signin = (subject: string, headline: string, line: string, label: string, ignore: string, code?: { title: string; line: string }): Email => ({
  subject,
  preheader: line,
  hero: "service",
  headline,
  greeting: "Hello,",
  paragraphs: [line],
  // 13.18: a six-digit code for readers in the installed web app, where a link
  // opens the browser instead. Supabase fills {{ .Token }}. Keep it exactly as written.
  ...(code ? { panels: [{ title: code.title, big: "{{ .Token }}", spaced: true, lines: [code.line], tone: "tint" as const }] } : {}),
  buttons: [{ label, url: "{{ .ConfirmationURL }}" }],
  after: [ignore],
  footer: "signin",
});
export const SIGNIN_TEMPLATES: Record<string, Email> = {
  confirm_signup: signin(
    "Confirm your email",
    "Confirm your email",
    "Tap the button to confirm your email and open your workbook.",
    "Confirm my email",
    "If you didn't create an account, you can ignore this email. Nothing will happen.",
  ),
  magic_link: signin(
    "Your sign-in link",
    "Your sign-in link",
    "Here's your sign-in link. It works once, and only for a short time.",
    "Sign in",
    "If you didn't ask for this, you can ignore it. Nobody can sign in without the link.",
    { title: "Or type this code", line: "Use it if you are signed in from the app on your home screen. It works once, and only for a short time." },
  ),
  reset_password: signin(
    "Reset your password",
    "Choose a new password",
    "Tap the button to choose a new password.",
    "Choose a new password",
    "If you didn't ask for this, you can ignore it. Your password stays the same.",
  ),
  change_email: signin(
    "Confirm your new email",
    "Confirm your new email",
    "Tap the button to confirm this is your new email address.",
    "Confirm my new email",
    "If you didn't ask for this, you can ignore it. Nothing will change.",
  ),
};

/** Renders a sign-in template for pasting into the Supabase email settings. */
export function renderSigninTemplate(name: keyof typeof SIGNIN_TEMPLATES, postal?: string | null): Rendered {
  const email = SIGNIN_TEMPLATES[name];
  if (!email) throw new Error(`unknown_signin_template ${String(name)}`);
  return render(email, footerText("signin", { manage: "{{ .SiteURL }}/you" }, postal));
}

// ---------- guards ----------
const TITLE_KEY = /title|workbook_?name|book_?name/i;

/** Refuses props that carry anything that looks like a title, whatever the type said. */
export function assertNoTitleProps(props: Record<string, unknown>): void {
  for (const key of Object.keys(props)) {
    if (TITLE_KEY.test(key) && props[key] !== undefined) throw new Error(`reader_email_refuses_title_prop ${key}`);
  }
}

/** Refuses a subject that names the theme or carries an email address. */
export function assertSubjectSafe(subject: string, props: { themeName?: string }): void {
  if (/@/.test(subject)) throw new Error("reader_email_subject_has_address");
  const theme = (props.themeName ?? "").trim();
  if (theme && subject.toLowerCase().includes(theme.toLowerCase())) throw new Error("reader_email_subject_names_theme");
}

export const READER_CATEGORY: Record<FooterKind, "transactional" | "progress" | "marketing" | "partner"> = {
  service: "transactional",
  signin: "transactional",
  reminder: "transactional",
  deleted: "transactional",
  author: "transactional",
  progress: "progress",
  marketing: "marketing",
  partner: "partner",
  partner_invite: "partner",
  partner_stopped: "partner",
};

export type ReaderRendered = Rendered & { footer: FooterKind; category: (typeof READER_CATEGORY)[FooterKind] };

/**
 * Builds and renders one reader email. `links` are the footer links; `postal`
 * is the postal address for the footer line. The lang attribute follows the
 * reader's locale.
 */
export function renderReader<K extends ReaderTemplateName>(
  name: K,
  props: ReaderProps[K],
  links: FooterLinks = {},
  postal?: string | null,
  lang = "en-GB",
): ReaderRendered {
  const make = READER_TEMPLATES[name];
  if (!make) throw new Error(`unknown_reader_template ${String(name)}`);
  assertNoTitleProps(props as Record<string, unknown>);
  const email = make(props);
  assertSubjectSafe(email.subject, props);
  const other = "readerName" in props ? String((props as { readerName?: string }).readerName ?? "") : "";
  const footer = footerText(email.footer, { manage: props.settingsUrl, ...links }, postal, other);
  return { ...render(email, footer, lang), footer: email.footer, category: READER_CATEGORY[email.footer] };
}
