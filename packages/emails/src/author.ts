// Emails to authors and publishers about their own workbooks. These may name
// the workbook, because the recipient wrote it. They are kept apart from the
// reader templates so the reader title test never covers them.

import { type Email, type FooterLinks, type Rendered, footerText, render } from "./layout.js";

export type AuthorBase = {
  /** The author's or publisher contact's first name, if known. */
  name?: string;
  workbookTitle: string;
  studioUrl: string;
  supportEmail: string;
};

export type AuthorProps = {
  invite: Omit<AuthorBase, "workbookTitle"> & { inviterName: string; organisationName: string; acceptUrl: string; workbookTitle?: string };
  submission_received: AuthorBase & { submittedAt: string };
  changes_requested: AuthorBase & { notes: string[]; reviewUrl: string };
  ready_for_sign_off: AuthorBase & { signOffUrl: string };
  live: AuthorBase & { liveUrl: string };
  paused: AuthorBase & { reason?: string };
  payout_action_needed: AuthorBase & { actionUrl: string; what: string };
  statement_ready: AuthorBase & { period: string; statementUrl: string };
};
export type AuthorTemplateName = keyof AuthorProps;

const hi = (name?: string) => (name && name.trim() ? `Hi ${name.trim()},` : "Hello,");

export const AUTHOR_TEMPLATES: { [K in AuthorTemplateName]: (props: AuthorProps[K]) => Email } = {
  invite: (x) => ({
    subject: "You're invited to publish on Akana",
    preheader: `${x.inviterName} has invited you to ${x.organisationName}.`,
    hero: "author",
    eyebrow: "Invitation",
    headline: `Join ${x.organisationName} on Akana`,
    greeting: hi(x.name),
    paragraphs: [
      `${x.inviterName} has invited you to ${x.organisationName} on Akana, the place where books become practical.`,
      x.workbookTitle ? `They'd like you to work on ${x.workbookTitle}.` : "Once you accept, you can see the workbooks the organisation is building.",
    ],
    after: ["The invitation works once. If you weren't expecting it, you can ignore this email."],
    buttons: [{ label: "Accept the invitation", url: x.acceptUrl }],
    footer: "author",
  }),

  submission_received: (x) => ({
    subject: "Your workbook has been submitted",
    preheader: "It's in the review queue now.",
    hero: "author",
    eyebrow: "Submission received",
    headline: `${x.workbookTitle} is in review`,
    greeting: hi(x.name),
    paragraphs: [`${x.workbookTitle} was submitted on ${x.submittedAt}. It's now in the review queue.`, "Review checks structure, house style and the claims rules for its genre. You'll hear back as soon as it's done."],
    buttons: [{ label: "Open the Studio", url: x.studioUrl }],
    footer: "author",
  }),

  changes_requested: (x) => ({
    subject: "A few changes before your workbook goes live",
    preheader: "The review notes are ready.",
    hero: "author",
    eyebrow: "Changes requested",
    headline: `Changes for ${x.workbookTitle}`,
    greeting: hi(x.name),
    paragraphs: [`The review of ${x.workbookTitle} is done, and a few changes are needed before it can go live.`],
    panels: [{ title: "What to change", items: x.notes, tone: "tint" }],
    after: ["Make the changes in the Studio and submit again. Nothing else is needed."],
    buttons: [{ label: "See the notes", url: x.reviewUrl }],
    footer: "author",
  }),

  ready_for_sign_off: (x) => ({
    subject: "Your workbook is ready for sign-off",
    preheader: "One last look, then it goes live.",
    hero: "author",
    eyebrow: "Ready for sign-off",
    headline: `${x.workbookTitle} passed review`,
    greeting: hi(x.name),
    paragraphs: [`${x.workbookTitle} has passed review. Take one last look and sign it off, and it goes live.`],
    buttons: [{ label: "Review and sign off", url: x.signOffUrl }],
    footer: "author",
  }),

  live: (x) => ({
    subject: "Your workbook is live",
    preheader: "Readers can find it now.",
    hero: "author",
    eyebrow: "Live",
    headline: `${x.workbookTitle} is live`,
    greeting: hi(x.name),
    paragraphs: [`${x.workbookTitle} is live on Akana. Readers can find it in the Library now.`, "Sales and reader numbers appear in the Studio as they come in."],
    buttons: [
      { label: "See it live", url: x.liveUrl },
      { label: "Open the Studio", url: x.studioUrl },
    ],
    footer: "author",
  }),

  paused: (x) => ({
    subject: "Your workbook is paused",
    preheader: "It's hidden from new readers for now.",
    hero: "author",
    eyebrow: "Paused",
    headline: `${x.workbookTitle} is paused`,
    greeting: hi(x.name),
    paragraphs: [
      `${x.workbookTitle} is paused. New readers can't buy it for now, and readers who already have it keep their access.`,
      ...(x.reason ? [x.reason] : []),
      `If you have questions, contact ${x.supportEmail}.`,
    ],
    buttons: [{ label: "Open the Studio", url: x.studioUrl }],
    footer: "author",
  }),

  payout_action_needed: (x) => ({
    subject: "Action needed for your payouts",
    preheader: "A short step so payouts can continue.",
    hero: "author",
    eyebrow: "Payouts",
    headline: "Action needed for your payouts",
    greeting: hi(x.name),
    paragraphs: [`Payouts for ${x.workbookTitle} need one more step from you.`],
    panels: [{ title: "What's needed", lines: [x.what], tone: "tint" }],
    after: ["Until it's done, earnings are held safely and paid out once the step is complete."],
    buttons: [{ label: "Complete the step", url: x.actionUrl }],
    footer: "author",
  }),

  statement_ready: (x) => ({
    subject: "Your statement is ready",
    preheader: `Your statement for ${x.period}.`,
    hero: "author",
    eyebrow: "Statement",
    headline: `Your statement for ${x.period}`,
    greeting: hi(x.name),
    paragraphs: [`Your statement for ${x.workbookTitle} covering ${x.period} is ready in the Studio.`],
    buttons: [{ label: "Open the statement", url: x.statementUrl }],
    footer: "author",
  }),
};

export function renderAuthor<K extends AuthorTemplateName>(name: K, props: AuthorProps[K], links: FooterLinks = {}, postal?: string | null, lang = "en-GB"): Rendered {
  const make = AUTHOR_TEMPLATES[name];
  if (!make) throw new Error(`unknown_author_template ${String(name)}`);
  const email = make(props);
  return render(email, footerText("author", { manage: props.studioUrl, ...links }, postal), lang);
}
