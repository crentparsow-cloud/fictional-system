// The sign-in code for a tenant site (F-133). A reader on a tenant's own
// domain signs in with a code Akana's server makes for that one site.
// Invariants, enforced here and in tenant-code.test.ts:
//  - No link of any kind in the body. A code typed on the site is the only
//    way in, so there is nothing to click and nothing to redirect.
//  - No workbook or book title, ever. The props take none.
//  - The subject and body name the site that asked for the code and say it
//    is powered by Akana, so a code the reader did not ask for on that site
//    is recognisably not theirs to type anywhere else.
//  - The email comes from Akana, in Akana's own look, not the tenant's.

import { type Rendered, BRAND, footerText, render } from "./layout";
import { assertNoTitleProps } from "./reader";

export type TenantCodeProps = {
  /** The tenant site's name, as the tenant set it. Plain text. */
  siteName: string;
  /** The code, digits only. */
  code: string;
  /** How long the code works, in minutes. */
  minutes: number;
  supportEmail: string;
  title?: never;
  shortTitle?: never;
  workbookTitle?: never;
  bookTitle?: never;
  workbookName?: never;
  themeName?: never;
};

/** A site name is tenant-set text: keep it to one short line with nothing that reads as a link or markup. */
export function plainSiteName(name: string): string {
  const cleaned = name
    .replace(/[\u0000-\u001f\u007f<>]/g, " ")
    .replace(/https?:\/\/\S*/gi, " ")
    .replace(/\bwww\.\S*/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
    .trim();
  return cleaned || "this site";
}

/** "1234 5678": easier to read and to type. */
export function spacedCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)} ${code.slice(4)}` : code;
}

export function renderTenantCode(props: TenantCodeProps, postal?: string | null, lang = "en-GB"): Rendered {
  assertNoTitleProps(props as Record<string, unknown>);
  if (!/^\d{6,10}$/.test(props.code)) throw new Error("tenant_code_email: the code must be digits");
  const site = plainSiteName(props.siteName);
  const email = {
    subject: `Your sign-in code for ${site}, powered by ${BRAND}`,
    preheader: `It works for ${props.minutes} minutes, on ${site} only.`,
    hero: "brand" as const,
    eyebrow: "Sign-in code",
    headline: spacedCode(props.code),
    greeting: "Hello,",
    paragraphs: [
      `Someone asked to sign in to ${site} with this email address. ${site} is powered by ${BRAND}, and you sign in there with your ${BRAND} account.`,
      `Type this code on the ${site} sign-in page: ${spacedCode(props.code)}`,
      `It works for ${props.minutes} minutes and only on ${site}. It cannot be used on any other site.`,
    ],
    after: [
      `Only type this code on the page where you asked for it. Nobody from ${BRAND} or ${site} will ever ask you for it.`,
      "If you did not ask for a code, you can ignore this email. Nobody can sign in without it.",
    ],
    buttons: [],
    footer: "service" as const,
  };
  const base = footerText("service", {}, postal);
  return render(email, { ...base, lines: [`Sent by ${BRAND} because a sign-in code was asked for on ${site}. Questions: ${props.supportEmail || "reply to this email"}.`], safety: false }, lang);
}
