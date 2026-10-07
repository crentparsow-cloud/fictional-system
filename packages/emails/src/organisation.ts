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

import { type Email, type Rendered, BRAND, footerText, render } from "./layout";
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
};
export type OrganisationTemplateName = keyof OrganisationProps;

/** The privacy line, in the words akana-business.md gives the product. */
export const ORGANISATION_PRIVACY_LINE = `Your organisation can see how many people have started, never who wrote what. Your answers are sealed. No one at your organisation, the author or ${BRAND} staff can read them.`;

const clean = (s: string, fallback: string) => {
  const t = (s ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, 120);
  return t || fallback;
};

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
