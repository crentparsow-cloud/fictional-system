// The "Send this workbook" email (build list 14.14), to the person receiving
// the gift. Invariants, enforced here and in gift.test.ts:
//  - No workbook or book title, ever. The props take no title. A gift of a
//    wellbeing title would tell the inbox owner, and anyone reading over
//    their shoulder, something about the giver's view of their health.
//  - The giver is not named either: a member chose to give, and the email
//    says only "a member".
//  - The subject is a fixed string. The recipient needs no card and the
//    email says so; nothing renews.

import { type Rendered, BRAND, footerText, render } from "./layout";
import { assertNoTitleProps } from "./reader";

export type GiftProps = {
  /** The claim link, with the token in the path. */
  claimUrl: string;
  /** When the link stops working, as a date the reader can read. */
  expiresOn: string;
  supportEmail: string;
  title?: never;
  shortTitle?: never;
  workbookTitle?: never;
  bookTitle?: never;
  workbookName?: never;
  themeName?: never;
};

export function renderGift(props: GiftProps, postal?: string | null, lang = "en-GB"): Rendered {
  assertNoTitleProps(props as Record<string, unknown>);
  const email = {
    subject: `A workbook has been sent to you on ${BRAND}`,
    preheader: "No card and nothing to pay.",
    hero: "brand" as const,
    eyebrow: "A gift",
    headline: "A member has sent you a workbook",
    greeting: "Hello,",
    paragraphs: [
      `A member of ${BRAND} chose to give you a full workbook. ${BRAND} turns published books into guided workbooks you do a step at a time, in your own words.`,
      "You do not need a card, and nothing renews. Sign in or make an account, and it is yours to keep.",
    ],
    after: [`This link works until ${props.expiresOn}.`, "If you were not expecting it, you can ignore this email."],
    buttons: [{ label: "Claim your workbook", url: props.claimUrl }],
    footer: "service" as const,
  };
  const base = footerText("service", {}, postal);
  return render(email, { ...base, lines: [`Sent by ${BRAND} for a member who chose to give you a workbook. Questions: ${props.supportEmail || "reply to this email"}.`], safety: false }, lang);
}
