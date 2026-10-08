// Emails about Akana for organisations (F-203, F-204).
//
// Invariants, enforced here and in organisation.test.ts:
//  - No workbook or book title, ever. The props take no title and the
//    reader title guard refuses any key that looks like one. An invitation
//    from an employer that named a wellbeing title would tell the inbox
//    owner, and anyone who reads it, something about their health.
//  - The subject is a fixed string. It never carries the organisation's
//    name, an address or any workbook wording.
//  - The invitation repeats the privacy line, the 18 or over rule and,
//    for a seat, that taking part is the person's own choice.

import { type Email, type Panel, type Rendered, BRAND, footerText, render } from "./layout";
import { assertNoTitleProps } from "./reader";

type OrganisationBase = {
  /** The organisation's display name, as Akana staff recorded it. */
  organisationName: string;
  supportEmail: string;
  title?: never;
  shortTitle?: never;
  workbookTitle?: never;
  bookTitle?: never;
  workbookName?: never;
  themeName?: never;
};

export type OrganisationProps = {
  /** To a person the organisation invited to take a seat. */
  seat_invite: OrganisationBase & { acceptUrl: string; declineUrl: string; expiresOn: string };
  /** To the person Akana staff invited to run the organisation's account. */
  admin_invite: OrganisationBase & { acceptUrl: string; consoleUrl: string };
  /** Billing (F-220, 0031): to the owner and finance contacts only. Never names a member. */
  org_invoice_sent: OrganisationBase & BillingLink & { invoiceNumber?: string; amount: string; dueOn: string; payUrl?: string };
  org_payment_problem: OrganisationBase & BillingLink & { mode: "failed" | "overdue"; invoiceNumber?: string; amount?: string; accessUntil?: string; payUrl?: string };
  org_licence_suspended: OrganisationBase & BillingLink & { payUrl?: string };
  org_licence_ending: OrganisationBase & BillingLink & { endsOn: string; personal?: boolean };
  org_licence_ended: OrganisationBase & BillingLink & { endedOn: string; refundAmount?: string; refundStatus?: "pending" | "succeeded" | "failed" };
  /** DMCC reminder notice, consumer organisers only: what they pay, how often, the next payment and how to cancel. */
  org_terms_reminder: OrganisationBase & BillingLink & { price: string; yearly: boolean; nextDate: string; seats: number };
};
type BillingLink = { billingUrl: string };
export type OrganisationTemplateName = keyof OrganisationProps;

/** The privacy line, in the words akana-business.md gives the product. */
export const ORGANISATION_PRIVACY_LINE = `Your organisation can see how many people have started, never who wrote what. Your answers are sealed. No one at your organisation, the author or ${BRAND} staff can read them.`;

const clean = (s: string, fallback: string) => {
  const t = (s ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, 120);
  return t || fallback;
};

/** Templates that go to the people who run the account, not to invitees. */
export const ORGANISATION_BILLING_TEMPLATES = [
  "org_invoice_sent",
  "org_payment_problem",
  "org_licence_suspended",
  "org_licence_ending",
  "org_licence_ended",
  "org_terms_reminder",
] as const satisfies readonly OrganisationTemplateName[];

const KEEP_WORK = "Everyone with a seat keeps their account and everything they wrote. It stays private, and they can still read it.";
const CANCEL_LINE = "To cancel, go to Billing in your organisation console and choose Cancel. No questions asked.";
const REFUND_STATUS: Record<string, string> = { pending: "On its way", succeeded: "Sent", failed: "Delayed, and being retried" };
const billingButtons = (x: BillingLink, payUrl?: string) =>
  payUrl ? [{ label: "View or pay the invoice", url: payUrl }, { label: "Open Billing", url: x.billingUrl }] : [{ label: "Open Billing", url: x.billingUrl }];

export const ORGANISATION_TEMPLATES: { [K in OrganisationTemplateName]: (props: OrganisationProps[K]) => Email } = {
  seat_invite: (x) => {
    const org = clean(x.organisationName, "An organisation");
    return {
      subject: `You're invited to use ${BRAND}`,
      preheader: `A place on ${BRAND}, if you would like it.`,
      hero: "brand",
      eyebrow: "Invitation",
      headline: `${org} has a place for you on ${BRAND}`,
      greeting: "Hello,",
      paragraphs: [
        `${org} has a place for you on ${BRAND}. ${BRAND} turns published books into guided workbooks you do a step at a time, in your own words.`,
        "Taking part is your choice. You can say no, and you can stop at any time.",
      ],
      panels: [
        { title: "What stays private", lines: [ORGANISATION_PRIVACY_LINE], tone: "tint" },
        {
          title: "Before you accept",
          items: [
            "You must be 18 or over.",
            `You can use an ${BRAND} account you already have, or make one.`,
            "If the place ends, you keep everything you wrote.",
          ],
          tone: "terms",
        },
      ],
      after: [`This invitation works until ${clean(x.expiresOn, "it expires")}.`, "If you weren't expecting it, you can ignore this email."],
      buttons: [{ label: "See the invitation", url: x.acceptUrl }],
      quietLink: { label: "No, thank you", url: x.declineUrl },
      footer: "service",
    };
  },

  admin_invite: (x) => {
    const org = clean(x.organisationName, "your organisation");
    return {
      subject: `Your ${BRAND} organisation account`,
      preheader: `Set up access for your people on ${BRAND}.`,
      hero: "brand",
      eyebrow: "Invitation",
      headline: `Run ${org} on ${BRAND}`,
      greeting: "Hello,",
      paragraphs: [
        `The ${BRAND} team has set up ${org}. Accept this invitation to invite your people and see how many places are taken.`,
        "You will see counts only. You will never see what anyone wrote, and small numbers are not shown.",
      ],
      panels: [{ title: "What your people are told", lines: [ORGANISATION_PRIVACY_LINE], tone: "tint" }],
      after: ["The invitation works once and lasts 14 days. Sign in with this email address to accept it."],
      buttons: [{ label: "Accept the invitation", url: x.acceptUrl }],
      footer: "service",
    };
  },

  org_invoice_sent: (x) => {
    const org = clean(x.organisationName, "your organisation");
    const rows: [string, string][] = [];
    if (x.invoiceNumber) rows.push(["Invoice", clean(x.invoiceNumber, "")]);
    rows.push(["Amount", clean(x.amount, "")], ["Due by", clean(x.dueOn, "")]);
    return {
      subject: `A new ${BRAND} invoice`,
      preheader: "Your invoice is ready to pay.",
      hero: "service",
      eyebrow: "Billing",
      headline: "Your invoice is ready",
      greeting: "Hello,",
      paragraphs: [`There is a new invoice for ${org}'s ${BRAND} licence. It is your VAT invoice.`],
      panels: [{ rows, tone: "tint" }],
      after: ["Pay by card, Bacs Direct Debit or the bank details on the invoice. Billing in your console has every invoice."],
      buttons: billingButtons(x, x.payUrl),
      footer: "service",
    };
  },

  org_payment_problem: (x) => {
    const org = clean(x.organisationName, "your organisation");
    const failed = x.mode === "failed";
    const rows: [string, string][] = [];
    if (x.invoiceNumber) rows.push(["Invoice", clean(x.invoiceNumber, "")]);
    if (x.amount) rows.push(["Amount", clean(x.amount, "")]);
    return {
      subject: failed ? `A ${BRAND} payment didn't go through` : `A ${BRAND} invoice is overdue`,
      preheader: failed ? "Please check the payment details." : "Paying it keeps access going.",
      hero: "service",
      eyebrow: "Billing",
      headline: failed ? "A payment didn't go through" : "An invoice is overdue",
      greeting: "Hello,",
      paragraphs: [
        failed
          ? `A payment for ${org}'s ${BRAND} licence did not go through. This often happens when a card expires or a bank declines a payment.`
          : `An invoice for ${org}'s ${BRAND} licence has passed its due date.`,
        x.accessUntil
          ? `Access carries on until ${clean(x.accessUntil, "")}. Paying the invoice before then keeps it going.`
          : "Paying the invoice keeps access going.",
      ],
      panels: rows.length ? [{ rows, tone: "tint" }] : [],
      after: ["If you have already paid, thank you. There is nothing more to do."],
      buttons: billingButtons(x, x.payUrl),
      footer: "service",
    };
  },

  org_licence_suspended: (x) => {
    const org = clean(x.organisationName, "your organisation");
    return {
      subject: `${BRAND} access is paused`,
      preheader: "It comes back when the payment goes through.",
      hero: "service",
      eyebrow: "Billing",
      headline: "Access is paused",
      greeting: "Hello,",
      paragraphs: [
        `Access through ${org}'s ${BRAND} licence is paused because a payment has not gone through.`,
        "It comes back as soon as the payment is made. Nothing anyone wrote is lost.",
      ],
      panels: [{ lines: [KEEP_WORK], tone: "tint" }],
      buttons: billingButtons(x, x.payUrl),
      footer: "service",
    };
  },

  org_licence_ending: (x) => {
    const org = clean(x.organisationName, "your organisation");
    const endsOn = clean(x.endsOn, "the end of the period you have paid for");
    return {
      subject: `Your ${BRAND} licence is ending`,
      preheader: `Access continues until ${endsOn}.`,
      hero: "service",
      eyebrow: x.personal ? "Cancellation confirmed" : "Billing",
      headline: "Your licence is ending",
      greeting: "Hello,",
      paragraphs: [`${org}'s ${BRAND} licence will not renew. Nothing more will be charged.`],
      panels: [{ title: "Access until", big: endsOn, tone: "service" }, { lines: [KEEP_WORK], tone: "tint" }],
      after: ["You can download your records from Billing until then, and for 30 days after."],
      buttons: billingButtons(x),
      footer: "service",
    };
  },

  org_licence_ended: (x) => {
    const org = clean(x.organisationName, "your organisation");
    const panels: Panel[] = [{ lines: [KEEP_WORK], tone: "tint" }];
    if (x.refundAmount) {
      panels.unshift({
        title: "Your refund",
        rows: [
          ["Amount", clean(x.refundAmount, "")],
          ["Status", REFUND_STATUS[x.refundStatus ?? "pending"] ?? "On its way"],
        ],
        lines: ["It goes back to the card you paid with. Refunds can take several business days to show."],
        tone: "tint",
      });
    }
    return {
      subject: `Your ${BRAND} licence has ended`,
      preheader: "Nothing more will be charged.",
      hero: "service",
      eyebrow: "Billing",
      headline: "Your licence has ended",
      greeting: "Hello,",
      paragraphs: [
        `${org}'s ${BRAND} licence ended on ${clean(x.endedOn, "today")}. Nothing more will be charged.`,
        ...(x.refundAmount ? ["You cancelled within the 14-day cooling-off period, so the days you had not used are refunded."] : []),
      ],
      panels,
      after: ["Download your records from Billing within 30 days. After that we delete your roster and the details of the people who run the account."],
      buttons: billingButtons(x),
      footer: "service",
    };
  },

  org_terms_reminder: (x) => {
    const org = clean(x.organisationName, "your group");
    const price = clean(x.price, "");
    const often = x.yearly ? "a year" : "a month";
    const nextDate = clean(x.nextDate, "");
    return {
      subject: `A reminder of your ${BRAND} plan terms`,
      preheader: "What you pay, how often, and how to cancel.",
      hero: "service",
      eyebrow: "Your plan",
      headline: "Your plan terms, in one place",
      greeting: "Hello,",
      paragraphs: [
        `${org}'s ${BRAND} plan renews automatically until you cancel. You last paid ${price}, and you pay ${often}. Your next payment is on ${nextDate}.`,
        x.yearly
          ? "We send this reminder before every yearly renewal. After it renews, you have 14 days to cancel and get back the days you have not used."
          : "We send this reminder every six months, so you always know what you pay and how to stop.",
      ],
      panels: [
        {
          rows: [
            ["Last payment", price],
            ["How often", `${x.yearly ? "Every year" : "Every month"}, automatically, until you cancel`],
            ["Places", String(Math.max(1, Math.trunc(x.seats || 1)))],
            ["Next payment", nextDate],
          ],
          tone: "tint",
        },
        { title: "How to cancel", lines: [CANCEL_LINE], tone: "tint" },
      ],
      after: [`If you cancel before ${nextDate}, you will not be charged again. If you want to keep your plan, there is nothing to do.`],
      buttons: billingButtons(x),
      footer: "service",
    };
  },
};

export function renderOrganisation<K extends OrganisationTemplateName>(
  name: K,
  props: OrganisationProps[K],
  postal?: string | null,
  lang = "en-GB",
): Rendered {
  const make = ORGANISATION_TEMPLATES[name];
  if (!make) throw new Error(`unknown_organisation_template ${String(name)}`);
  assertNoTitleProps(props as Record<string, unknown>);
  const email = make(props);
  if (/@/.test(email.subject)) throw new Error("organisation_email_subject_has_address");
  const base = footerText("service", {}, postal);
  const org = clean(props.organisationName, "an organisation");
  const lines =
    name === "seat_invite"
      ? [`Sent by ${BRAND} on behalf of ${org}. Choose "No, thank you" and ${org} will not be able to invite this address again.`]
      : [`This email is about an ${BRAND} organisation account. Questions: ${props.supportEmail || "reply to this email"}.`];
  return render(email, { ...base, lines, safety: false }, lang);
}
