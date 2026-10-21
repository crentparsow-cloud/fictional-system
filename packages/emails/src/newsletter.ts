// The weekly newsletter (build list 6.11): the double opt-in confirmation and
// one issue with a single exercise.
//
// Invariants, enforced here and in newsletter.test.ts:
//  - No workbook or book title, ever. The props take no title and the reader
//    title guard refuses any key that looks like one. The web console also
//    checks the text of an issue against the live titles before it saves.
//  - The subject of an issue is the staff-written subject and nothing else.
//    It never carries an address.
//  - A paid cross-recommendation is labelled "Sponsored" in its own panel,
//    with the sponsor's name, one short text and one https link. No tracking
//    pixel, no redirect and no third-party script.
//  - An issue is a marketing email: the mailer refuses it without a real
//    postal address and an unsubscribe link.

import { type Email, type FooterLinks, type Rendered, BRAND, footerText, render } from "./layout";
import { assertNoTitleProps, assertSubjectSafe, READER_CATEGORY } from "./reader";

type NewsletterBase = {
  /** The site origin, for the one button. */
  appUrl: string;
  title?: never;
  shortTitle?: never;
  workbookTitle?: never;
  bookTitle?: never;
  workbookName?: never;
  themeName?: never;
};

export type NewsletterSponsor = { name: string; text: string; url: string };

export type NewsletterProps = {
  /** Double opt-in: the link confirms the address. */
  newsletter_confirm: NewsletterBase & { confirmUrl: string };
  /** One issue: an intro, one exercise and an optional sponsored block. */
  newsletter_issue: NewsletterBase & {
    subject: string;
    preheader?: string;
    intro?: string;
    exerciseHeading: string;
    /** The exercise, one paragraph per entry. */
    exerciseParagraphs: string[];
    sponsor?: NewsletterSponsor;
  };
};
export type NewsletterTemplateName = keyof NewsletterProps;

const https = (url: string): string => {
  if (!/^https:\/\/[^\s]+$/.test(url)) throw new Error("newsletter_url_must_be_https");
  return url;
};

export const NEWSLETTER_TEMPLATES: { [K in NewsletterTemplateName]: (props: NewsletterProps[K]) => Email } = {
  newsletter_confirm: (x) => ({
    subject: "Please confirm your address",
    preheader: "One tap and the weekly note is yours.",
    hero: "brand",
    eyebrow: `The ${BRAND} newsletter`,
    headline: "Please confirm your address",
    paragraphs: [
      `You asked for the weekly ${BRAND} newsletter. Each week it holds one short exercise you can try in a few minutes.`,
      "Confirm your address to start. Until you do, we send nothing else.",
    ],
    buttons: [{ label: "Confirm my address", url: https(x.confirmUrl) }],
    footer: "newsletter_confirm",
  }),

  newsletter_issue: (x) => {
    const sponsor = x.sponsor;
    return {
      subject: x.subject,
      preheader: x.preheader ?? "",
      hero: "brand",
      eyebrow: `The ${BRAND} newsletter`,
      headline: x.exerciseHeading,
      paragraphs: x.intro?.trim() ? [x.intro.trim()] : [],
      panels: [
        { title: "This week's exercise", lines: x.exerciseParagraphs, tone: "tint" },
        ...(sponsor ? [{ title: "Sponsored", lines: [`${sponsor.name}. ${sponsor.text}`], tone: "terms" as const }] : []),
      ],
      buttons: [{ label: `See the workbooks on ${BRAND}`, url: `${x.appUrl.replace(/\/$/, "")}/explore` }],
      ...(sponsor ? { quietLink: { label: `Sponsored: visit ${sponsor.name}`, url: https(sponsor.url) } } : {}),
      footer: "newsletter",
    };
  },
};

export type NewsletterRendered = Rendered & { category: (typeof READER_CATEGORY)[keyof typeof READER_CATEGORY] };

/** Builds and renders one newsletter email. `links` carry the unsubscribe URLs for an issue. */
export function renderNewsletter<K extends NewsletterTemplateName>(
  name: K,
  props: NewsletterProps[K],
  links: FooterLinks = {},
  postal?: string | null,
  lang = "en-GB",
): NewsletterRendered {
  const make = NEWSLETTER_TEMPLATES[name];
  if (!make) throw new Error(`unknown_newsletter_template ${String(name)}`);
  assertNoTitleProps(props as Record<string, unknown>);
  const email = make(props);
  assertSubjectSafe(email.subject, {});
  const footer = footerText(email.footer, links, postal);
  return { ...render(email, footer, lang), category: READER_CATEGORY[email.footer] };
}
