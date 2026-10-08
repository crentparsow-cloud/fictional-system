// Emails to authors and publishers about their own workbooks. These may name
// the workbook, because the recipient wrote it. They are kept apart from the
// reader templates so the reader title test never covers them.

import { type Email, type FooterLinks, type Rendered, footerText, render } from "./layout";

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
  /** Staff accepted the submission into review (F-043). */
  submission_accepted: AuthorBase;
  changes_requested: AuthorBase & { notes: string[]; reviewUrl: string };
  ready_for_sign_off: AuthorBase & { signOffUrl: string };
  /** Every release requirement is met and staff approved it. Not on sale yet (F-043). */
  approved: AuthorBase;
  live: AuthorBase & { liveUrl: string };
  paused: AuthorBase & { reason?: string };
  payout_action_needed: AuthorBase & { actionUrl: string; what: string };
  statement_ready: AuthorBase & { period: string; statementUrl: string };
  /**
   * Security notice to an organisation's owners and finance contacts when
   * payout details change (F-143): the payout bank account in Stripe, or
   * the tax residence and treaty declaration. Names no workbook.
   */
  payout_details_changed: Omit<AuthorBase, "workbookTitle"> & { organisationName: string; what: string; changedAt: string; payoutsUrl: string };
  /**
   * To the Akana team when someone sends the enquiry form on /publish (F-001).
   * studioUrl is where staff open leads. The subject is fixed: it never carries
   * the book title, the sender's name or their message.
   */
  lead_received: Omit<AuthorBase, "workbookTitle"> & {
    leadId: string;
    receivedAt: string;
    leadName: string;
    leadEmail: string;
    kind: string;
    organisation?: string;
    bookTitle?: string;
    bookRef?: string;
    genre?: string;
    interest?: string;
    message?: string;
  };
  /**
   * To the Akana reviewer a version was assigned to (F-084). Names the AK
   * code only, never the title. studioUrl is the review page.
   */
  review_assigned: Omit<AuthorBase, "workbookTitle"> & { code: string; assignedBy?: string };
  /**
   * To the Akana operator when an operational alert opens (F-142). Carries
   * the kind, the route and a short code only. studioUrl is /admin/ops.
   */
  ops_alert: Omit<AuthorBase, "workbookTitle"> & { kind: string; source: string; code?: string; at: string };
  /** Staff declined the submission (0013 submission_set_status), with the reason the author also sees in the Studio. */
  submission_declined: AuthorBase & { reason: string };
  /**
   * To the author organisation when Akana posts on the workbook's comment
   * thread (F-039). Never carries the comment: the author reads it in the
   * Studio, signed in. studioUrl is the workbook page.
   */
  workbook_comment: AuthorBase;
  /**
   * To Akana reviewers when the author organisation posts on a thread
   * (F-039). The AK code only, never the title or the comment. studioUrl is
   * the review page.
   */
  review_comment: Omit<AuthorBase, "workbookTitle"> & { code: string };
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

  submission_accepted: (x) => ({
    subject: "Your submission has been accepted",
    preheader: "The review has started.",
    hero: "author",
    eyebrow: "Accepted",
    headline: `${x.workbookTitle} is accepted`,
    greeting: hi(x.name),
    paragraphs: [
      `We have accepted ${x.workbookTitle} into review. An Akana editor is working on it now.`,
      "When it is ready, we will ask you to preview it in the reader and sign off the exact version that goes live.",
    ],
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

  approved: (x) => ({
    subject: "Your workbook is approved",
    preheader: "It goes live soon.",
    hero: "author",
    eyebrow: "Approved",
    headline: `${x.workbookTitle} is approved`,
    greeting: hi(x.name),
    paragraphs: [
      `${x.workbookTitle} has every sign-off it needs and is approved. It is not on sale yet.`,
      "We will email you again on the day it goes live.",
    ],
    buttons: [{ label: "Open the Studio", url: x.studioUrl }],
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

  payout_details_changed: (x) => ({
    subject: "Your payout details changed",
    preheader: "A security notice about where your earnings are paid.",
    hero: "author",
    eyebrow: "Security notice",
    headline: "Your payout details changed",
    greeting: hi(x.name),
    paragraphs: [`The payout details for ${x.organisationName} changed on ${x.changedAt}.`],
    panels: [{ title: "What changed", lines: [x.what], tone: "tint" }],
    after: [
      "If this was you or your team, there is nothing more to do.",
      `If you do not recognise it, contact ${x.supportEmail || "Akana support"} straight away. We will hold payouts while we check.`,
    ],
    buttons: [{ label: "Check your payouts", url: x.payoutsUrl }],
    footer: "author",
  }),

  lead_received: (x) => ({
    subject: LEAD_SUBJECT,
    preheader: "Someone has sent the Publish with Akana form.",
    hero: "author",
    eyebrow: "Enquiry",
    headline: "A new publishing enquiry",
    greeting: "Hello,",
    paragraphs: ["Someone has sent the enquiry form on the Publish with Akana page. They gave consent to be contacted about this enquiry only."],
    panels: [
      { title: "The enquiry", rows: leadRows(x), tone: "tint" },
      ...(x.message && x.message.trim() ? [{ title: "Their message", lines: [x.message.trim()], tone: "terms" as const }] : []),
    ],
    after: ["Reply from the team inbox, not a personal address. Do not add them to any mailing list."],
    buttons: [{ label: "Open leads", url: x.studioUrl }],
    footer: "author",
  }),

  review_assigned: (x) => ({
    subject: "A workbook is ready for your review",
    preheader: `${x.code} is in your review queue.`,
    hero: "author",
    eyebrow: "Review",
    headline: "A workbook is waiting for you",
    greeting: hi(x.name),
    paragraphs: [
      x.assignedBy ? `${x.assignedBy} has asked you to review ${x.code}.` : `You have been asked to review ${x.code}.`,
      "The validator results and the sign-offs it still needs are on the review page.",
    ],
    buttons: [{ label: "Open the review", url: x.studioUrl }],
    footer: "author",
  }),

  ops_alert: (x) => ({
    subject: "Akana alert: something needs a look",
    preheader: `${x.kind} on ${x.source}.`,
    hero: "author",
    eyebrow: "Alert",
    headline: x.kind,
    greeting: "Hello,",
    paragraphs: ["An operational alert has opened. Further failures of the same kind are counted on the alert, with no more email until it is acknowledged."],
    panels: [
      {
        title: "The alert",
        rows: [
          ["What", x.kind],
          ["Where", x.source],
          ...(x.code ? ([["Code", x.code]] as [string, string][]) : []),
          ["When", x.at],
        ],
        tone: "tint",
      },
    ],
    buttons: [{ label: "Open alerts", url: x.studioUrl }],
    footer: "author",
  }),

  submission_declined: (x) => ({
    subject: "About your submission",
    preheader: "We will not be taking it forward.",
    hero: "author",
    eyebrow: "Submission",
    headline: `We won't be taking ${x.workbookTitle} forward`,
    greeting: hi(x.name),
    paragraphs: [
      `Thank you for submitting ${x.workbookTitle}. We have looked at it carefully, and we will not be taking it forward as an Akana workbook.`,
    ],
    panels: [{ title: "Why", lines: [x.reason], tone: "tint" }],
    after: [
      "Nothing goes on sale and nothing is charged. Your book and your files stay in the Studio.",
      `If you would like to talk about it, reply to this email${x.supportEmail ? ` or write to ${x.supportEmail}` : ""}.`,
    ],
    buttons: [{ label: "Open the Studio", url: x.studioUrl }],
    footer: "author",
  }),

  workbook_comment: (x) => ({
    subject: "A new comment from the Akana team",
    preheader: "Read it in the Studio.",
    hero: "author",
    eyebrow: "Comment",
    headline: "The Akana team left a comment",
    greeting: hi(x.name),
    paragraphs: [
      `There is a new comment from the Akana team on ${x.workbookTitle}.`,
      "For privacy, comments are only shown in the Studio. Sign in to read it and reply.",
    ],
    buttons: [{ label: "Read the comment", url: x.studioUrl }],
    footer: "author",
  }),

  review_comment: (x) => ({
    subject: "A new comment on a workbook",
    preheader: `${x.code} has a new comment.`,
    hero: "author",
    eyebrow: "Comment",
    headline: "The author left a comment",
    greeting: hi(x.name),
    paragraphs: [`The author organisation posted on the comment thread for ${x.code}.`, "Comments are only shown in admin. Sign in to read it and reply."],
    buttons: [{ label: "Open the review", url: x.studioUrl }],
    footer: "author",
  }),
};

const LEAD_SUBJECT = "New publishing enquiry";

export function leadRows(x: AuthorProps["lead_received"]): [string, string][] {
  const rows: [string, string | undefined][] = [
    ["Name", x.leadName],
    ["Email", x.leadEmail],
    ["I am", x.kind],
    ["Organisation", x.organisation],
    ["Book title", x.bookTitle],
    ["Published at", x.bookRef],
    ["Genre", x.genre],
    ["Wants to talk about", x.interest],
    ["Received", x.receivedAt],
    ["Reference", x.leadId],
  ];
  return rows.filter((r): r is [string, string] => typeof r[1] === "string" && r[1].trim() !== "");
}

export function renderAuthor<K extends AuthorTemplateName>(name: K, props: AuthorProps[K], links: FooterLinks = {}, postal?: string | null, lang = "en-GB"): Rendered {
  const make = AUTHOR_TEMPLATES[name];
  if (!make) throw new Error(`unknown_author_template ${String(name)}`);
  const email = make(props);
  return render(email, footerText("author", { manage: props.studioUrl, ...links }, postal), lang);
}
