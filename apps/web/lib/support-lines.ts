/**
 * Support lines for the Help now hub (F-021), carried from
 * legacy/content/catalog/support_lines.json as typed data. Names, numbers,
 * hours and links are exactly as the legacy file has them. Nothing here is
 * invented. The legacy file carried one "checked" date for the whole set and
 * a verified flag per line; both are kept, with the date written on each line
 * so a later check can move one line without moving the rest.
 *
 * Rebuilt from this file every deploy. A weekly link checker is still to come.
 */

import type { MarketCode } from "@/lib/markets";

export type SupportGroupId = "crisis" | "abuse" | "addiction" | "gambling" | "family" | "grief";

/** The date every line below was last checked against its official source. */
export const SUPPORT_CHECKED = "2026-10-01";

export interface SupportLine {
  market: MarketCode;
  group: SupportGroupId;
  /** The service name as it appears on its own site. */
  name: string;
  /** A phone or text number, or a domain for a website-only service. */
  number: string;
  /** "Call", "Text SHOUT to", "Website" and so on. */
  how: string;
  /** Opening hours as published, or null when the source does not state them. */
  hours: string | null;
  url: string;
  /** False when the line is listed but its source could not be confirmed on the check date. */
  verified: boolean;
  /** YYYY-MM-DD. */
  verifiedOn: string;
}

export interface EmergencyLine {
  market: MarketCode;
  label: string;
  /** Null for "everywhere else": the reader's local number is unknown. */
  number: string | null;
  how: string;
  url: string | null;
}

export interface SupportGroupNote {
  market: MarketCode;
  group: SupportGroupId;
  note: string;
}

export const SUPPORT_GROUPS: readonly { id: SupportGroupId; title: string }[] = [
  { id: "crisis", title: "Crisis and suicide" },
  { id: "abuse", title: "Domestic abuse" },
  { id: "addiction", title: "Drugs and alcohol" },
  { id: "gambling", title: "Gambling" },
  { id: "family", title: "Family and friends of people in recovery" },
  { id: "grief", title: "Grief and loss" },
];

export const EMERGENCY_LINES: readonly EmergencyLine[] = [
  { market: "US", label: "Emergency services", number: "911", how: "Call", url: "https://www.911.gov/" },
  { market: "GB", label: "Emergency services", number: "999", how: "Call (112 also works)", url: "https://www.gov.uk/guidance/999-and-112-the-uks-national-emergency-numbers" },
  { market: "CA", label: "Emergency services", number: "911", how: "Call", url: "https://www.canada.ca/en/public-health/services/mental-health-services/mental-health-get-help.html" },
  { market: "AU", label: "Triple Zero", number: "000", how: "Call", url: "https://www.triplezero.gov.au/" },
  { market: "IE", label: "Emergency services", number: "112", how: "Call 112 or 999", url: "https://www.112.ie/" },
  { market: "NZ", label: "Emergency services", number: "111", how: "Call", url: "https://www.police.govt.nz/call-111" },
  { market: "XX", label: "Your local emergency number", number: null, how: "Call your local emergency number", url: null },
];

export const SUPPORT_GROUP_NOTES: readonly SupportGroupNote[] = [
  { market: "US", group: "grief", note: "No national grief helpline. Use 988 if grief feels unmanageable." },
  { market: "CA", group: "abuse", note: "No single national line. ShelterSafe connects to the nearest shelter." },
  { market: "CA", group: "addiction", note: "No single national line since Wellness Together Canada closed in April 2024. Health Canada lists national and provincial options." },
  { market: "CA", group: "gambling", note: "Provincial lines only. The Responsible Gambling Council lists every province and territory." },
  { market: "CA", group: "grief", note: "No national grief helpline. MyGrief.ca is a free national online program." },
  { market: "NZ", group: "grief", note: "No national grief helpline. 1737 counselors support people with grief." },
];

export const SUPPORT_LINES: readonly SupportLine[] = [
  { market: "US", group: "crisis", name: "988 Suicide & Crisis Lifeline", number: "988", how: "Call or text", hours: "24/7", url: "https://988lifeline.org/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "US", group: "abuse", name: "National Domestic Violence Hotline", number: "1-800-799-7233", how: "Call", hours: "24/7", url: "https://www.thehotline.org/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "US", group: "abuse", name: "National Domestic Violence Hotline (text)", number: "88788", how: "Text START to", hours: "24/7", url: "https://www.thehotline.org/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "US", group: "addiction", name: "SAMHSA National Helpline", number: "1-800-662-4357", how: "Call", hours: "24/7", url: "https://www.samhsa.gov/find-help/helplines/national-helpline", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "US", group: "gambling", name: "National Problem Gambling Helpline", number: "1-800-697-3738", how: "Call or text", hours: "24/7", url: "https://www.ncpgambling.org/help-treatment/about-the-national-problem-gambling-helpline/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "US", group: "family", name: "Al-Anon Family Groups", number: "al-anon.org", how: "Website", hours: null, url: "https://al-anon.org/al-anon-meetings/find-an-al-anon-meeting/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "US", group: "family", name: "Nar-Anon Family Groups", number: "nar-anon.org", how: "Website", hours: null, url: "https://www.nar-anon.org/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "GB", group: "crisis", name: "Samaritans", number: "116 123", how: "Call", hours: "24/7", url: "https://www.samaritans.org/how-we-can-help/contact-samaritan/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "GB", group: "crisis", name: "Shout", number: "85258", how: "Text SHOUT to", hours: "24/7", url: "https://giveusashout.org/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "GB", group: "crisis", name: "NHS 111 (England), mental health option", number: "111", how: "Call and choose the mental health option", hours: "24/7", url: "https://www.england.nhs.uk/south-east/2024/08/30/nhs-111-offering-crisis-mental-health-support-in-the-south-east/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "GB", group: "crisis", name: "NHS 24 (Scotland), mental health option", number: "111", how: "Call and choose the mental health option", hours: "24/7", url: "https://www.nhsinform.scot/illnesses-and-conditions/mental-health/mental-health-support/mental-health-services-at-nhs-24/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "GB", group: "crisis", name: "NHS 111 Wales, mental health", number: "111", how: "Call and press 2", hours: "24/7", url: "https://www.gov.wales/nhs-111-press-2", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "GB", group: "abuse", name: "National Domestic Abuse Helpline (Refuge)", number: "0808 2000 247", how: "Call", hours: "24/7", url: "https://www.nationaldahelpline.org.uk/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "GB", group: "abuse", name: "Scotland's Domestic Abuse and Forced Marriage Helpline", number: "0800 027 1234", how: "Call", hours: "24/7", url: "https://www.sdafmh.org.uk/en/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "GB", group: "addiction", name: "FRANK", number: "0300 123 6600", how: "Call", hours: "24/7", url: "https://www.talktofrank.com/contact-frank", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "GB", group: "addiction", name: "FRANK (text)", number: "82111", how: "Text", hours: "24/7", url: "https://www.talktofrank.com/contact-frank", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "GB", group: "gambling", name: "National Gambling Helpline (GamCare)", number: "0808 8020 133", how: "Call or WhatsApp", hours: "24/7", url: "https://www.gamcare.org.uk/get-support/talk-to-us-now/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "GB", group: "family", name: "Al-Anon UK", number: "0800 0086 811", how: "Call", hours: "7 days a week", url: "https://al-anonuk.org.uk/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "GB", group: "family", name: "Nar-Anon UK", number: "nar-anon.co.uk", how: "Website", hours: null, url: "https://www.nar-anon.co.uk/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "GB", group: "grief", name: "Cruse Bereavement Support", number: "0808 808 1677", how: "Call", hours: "Mon, Wed, Thu, Fri 9:30am to 5pm; Tue 1pm to 8pm", url: "https://www.cruse.org.uk/get-support/helpline/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "CA", group: "crisis", name: "9-8-8 Suicide Crisis Helpline", number: "988", how: "Call or text", hours: "24/7", url: "https://988.ca/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "CA", group: "abuse", name: "ShelterSafe (find a local shelter)", number: "sheltersafe.ca", how: "Website", hours: null, url: "https://sheltersafe.ca/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "CA", group: "addiction", name: "Health Canada: get help with substance use", number: "canada.ca", how: "Website", hours: null, url: "https://www.canada.ca/en/health-canada/services/substance-use/get-help/get-help-problematic-substance-use.html", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "CA", group: "gambling", name: "Provincial gambling helplines", number: "responsiblegambling.org", how: "Website", hours: null, url: "https://responsiblegambling.org/for-the-public/problem-gambling-help/help-for-canadians/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "CA", group: "family", name: "Al-Anon Family Groups", number: "al-anon.org", how: "Website", hours: null, url: "https://al-anon.org/al-anon-meetings/find-an-al-anon-meeting/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "CA", group: "family", name: "Nar-Anon Family Groups", number: "nar-anon.org", how: "Website", hours: null, url: "https://www.nar-anon.org/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "CA", group: "grief", name: "MyGrief.ca (Canadian Virtual Hospice)", number: "mygrief.ca", how: "Website", hours: null, url: "https://www.mygrief.ca/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "AU", group: "crisis", name: "Lifeline", number: "13 11 14", how: "Call", hours: "24/7", url: "https://www.lifeline.org.au/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "AU", group: "crisis", name: "Lifeline (text)", number: "0477 13 11 14", how: "Text", hours: "24/7", url: "https://www.lifeline.org.au/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "AU", group: "abuse", name: "1800RESPECT", number: "1800 737 732", how: "Call", hours: "24/7", url: "https://www.1800respect.org.au/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "AU", group: "abuse", name: "1800RESPECT (text)", number: "0458 737 732", how: "Text", hours: "24/7", url: "https://www.1800respect.org.au/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "AU", group: "addiction", name: "National Alcohol and Other Drug Hotline", number: "1800 250 015", how: "Call", hours: "24/7 (SA: 8:30am to 10pm)", url: "https://www.health.gov.au/contacts/national-alcohol-and-other-drug-hotline", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "AU", group: "gambling", name: "Gambling Help Online", number: "1800 858 858", how: "Call", hours: "24/7", url: "https://www.gamblinghelponline.org.au/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "AU", group: "family", name: "Al-Anon Australia", number: "1300 252 666", how: "Call", hours: null, url: "https://www.al-anon.org.au/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "AU", group: "family", name: "Nar-Anon Australia", number: "naranon.com.au", how: "Website", hours: null, url: "https://naranon.com.au/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "AU", group: "grief", name: "Griefline", number: "1300 845 745", how: "Call", hours: "Mon to Fri 10am to 8pm AEST/AEDT", url: "https://griefline.org.au/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "IE", group: "crisis", name: "Samaritans Ireland", number: "116 123", how: "Call", hours: "24/7", url: "https://www.samaritans.org/ireland/how-we-can-help/contact-samaritan/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "IE", group: "crisis", name: "Text About It", number: "50808", how: "Text HELLO to", hours: "24/7", url: "https://textaboutit.ie/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "IE", group: "abuse", name: "Women's Aid", number: "1800 341 900", how: "Call", hours: "24/7", url: "https://www.womensaid.ie/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "IE", group: "abuse", name: "Men's Aid", number: "01 554 3811", how: "Call", hours: "Mon to Fri 9am to 5pm", url: "https://www.mensaid.ie/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "IE", group: "addiction", name: "HSE Drugs and Alcohol Helpline", number: "1800 459 459", how: "Call", hours: "Mon to Fri 9:30am to 5:30pm", url: "https://www2.hse.ie/services/habit-addiction/drugs-and-alcohol-helpline/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "IE", group: "gambling", name: "GamblingCare.ie National Helpline", number: "1800 936 725", how: "Call", hours: "24/7", url: "https://www.gamblingcare.ie/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "IE", group: "gambling", name: "Gamblers Anonymous Ireland", number: "01 872 1133", how: "Call", hours: "10am to 10pm daily", url: "https://www.gamblersanonymous.ie/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "IE", group: "family", name: "Al-Anon (UK and Eire)", number: "01 873 2699", how: "Call", hours: "7 days a week", url: "https://al-anonuk.org.uk/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "IE", group: "family", name: "Nar-Anon Family Groups", number: "nar-anon.org", how: "Website", hours: null, url: "https://www.nar-anon.org/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "IE", group: "grief", name: "Irish Hospice Foundation Bereavement Support Line", number: "1800 80 70 77", how: "Call", hours: "Mon to Fri 10am to 1pm", url: "https://hospicefoundation.ie/our-supports-services/bereavement-loss-hub/bereavement-support-line/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "NZ", group: "crisis", name: "1737 Need to talk?", number: "1737", how: "Call or text", hours: "24/7", url: "https://1737.org.nz/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "NZ", group: "abuse", name: "Women's Refuge Crisisline", number: "0800 733 843", how: "Call", hours: "24/7", url: "https://womensrefuge.org.nz/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "NZ", group: "abuse", name: "Are You OK family violence line", number: "0800 456 450", how: "Call", hours: "24/7", url: "https://areyouok.org.nz/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "NZ", group: "addiction", name: "Alcohol Drug Helpline", number: "0800 787 797", how: "Call", hours: "24/7", url: "https://alcoholdrughelp.org.nz/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "NZ", group: "addiction", name: "Alcohol Drug Helpline (text)", number: "8681", how: "Text", hours: null, url: "https://1737.org.nz/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "NZ", group: "gambling", name: "Gambling Helpline", number: "0800 654 655", how: "Call", hours: "24/7", url: "https://gamblinghelpline.co.nz/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "NZ", group: "gambling", name: "Gambling Helpline (text)", number: "8006", how: "Text", hours: null, url: "https://gamblinghelpline.co.nz/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "NZ", group: "family", name: "Al-Anon New Zealand", number: "al-anon.org.nz", how: "Website", hours: null, url: "https://al-anon.org.nz/", verified: false, verifiedOn: SUPPORT_CHECKED },
  { market: "NZ", group: "family", name: "Nar-Anon New Zealand", number: "nar-anon.org.nz", how: "Website", hours: null, url: "https://www.nar-anon.org.nz/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "NZ", group: "grief", name: "1737 Need to talk?", number: "1737", how: "Call or text", hours: "24/7", url: "https://1737.org.nz/", verified: true, verifiedOn: SUPPORT_CHECKED },
  { market: "XX", group: "crisis", name: "Find A Helpline", number: "findahelpline.com", how: "Website", hours: null, url: "https://findahelpline.com/", verified: true, verifiedOn: SUPPORT_CHECKED },
];

/** Lines for one market, grouped in SUPPORT_GROUPS order. Groups with no line and no note are left out. */
export function supportLinesFor(market: MarketCode): { id: SupportGroupId; title: string; note: string | null; lines: SupportLine[] }[] {
  return SUPPORT_GROUPS.map((g) => ({
    id: g.id,
    title: g.title,
    note: SUPPORT_GROUP_NOTES.find((n) => n.market === market && n.group === g.id)?.note ?? null,
    lines: SUPPORT_LINES.filter((l) => l.market === market && l.group === g.id),
  })).filter((g) => g.lines.length > 0 || g.note);
}

export function emergencyFor(market: MarketCode): EmergencyLine {
  return EMERGENCY_LINES.find((e) => e.market === market) ?? EMERGENCY_LINES[EMERGENCY_LINES.length - 1]!;
}

/**
 * The href for a line, as the legacy app built it: a website is https://,
 * a text line is sms:, everything else is tel:. Spaces and dashes are
 * dropped from the dialled number so a phone can place the call.
 */
export function contactHref(line: Pick<SupportLine, "number" | "how" | "url">): string {
  if (/^website/i.test(line.how)) return line.url;
  const digits = line.number.replace(/[^\d+]/g, "");
  return (/^text/i.test(line.how) ? "sms:" : "tel:") + digits;
}

/**
 * The region from an Accept-Language header, for example en-GB gives GB. Only
 * a launch market is returned; anything else is null so the caller falls back.
 */
export function regionFromAcceptLanguage(header: string | null | undefined, allowed: readonly string[]): string | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const tag = part.trim().split(";")[0]?.trim() ?? "";
    const region = tag.split("-")[1]?.toUpperCase();
    if (region && allowed.includes(region)) return region;
  }
  return null;
}

// ---------- signposts (F-154) ----------

/**
 * Signpost groups named by a title (for example a debt or grief workbook)
 * and shown beside Help now on that title. They are not crisis lines and do
 * not appear in the Help now hub's own list. Carried from the signposts block
 * in content/catalog/support_lines.json. Signposts only: Akana claims no
 * endorsement or partnership.
 *
 * GB only for now. Each number and its hours were read on the organisation's
 * own website on SIGNPOSTS_CHECKED. Every other market is null until it has
 * been checked; a null market shows no signpost rather than a guess.
 */
export type SignpostId =
  | "money_worries_lines"
  | "eating_support_lines"
  | "bereavement_support_lines"
  | "new_parent_support_lines"
  | "carer_support_lines";

export const SIGNPOSTS_CHECKED = "2026-10-07";

export interface SignpostLine {
  /** The service name as it appears on its own site. */
  name: string;
  /** A phone number, a domain for a website-only service, or null when not yet verified [check]. */
  number: string | null;
  how: string;
  hours: string | null;
  url: string;
  verified: boolean;
  /** YYYY-MM-DD. */
  verifiedOn: string;
}

export const SIGNPOST_GROUPS: readonly { id: SignpostId; title: string }[] = [
  { id: "money_worries_lines", title: "Money worries" },
  { id: "eating_support_lines", title: "Food and eating" },
  { id: "bereavement_support_lines", title: "Bereavement" },
  { id: "new_parent_support_lines", title: "New parents" },
  { id: "carer_support_lines", title: "Carers" },
];

/** Shown under any signpost list. */
export const SIGNPOST_NOTE = "These are independent services. Akana is not connected to them.";

const c = SIGNPOSTS_CHECKED;
const BEAT = "https://www.beateatingdisorders.org.uk/get-information-and-support/get-help-for-myself/helpline/";

export const SIGNPOST_LINES: Readonly<Record<SignpostId, Partial<Record<MarketCode, readonly SignpostLine[] | null>>>> = {
  money_worries_lines: {
    GB: [
      { name: "MoneyHelper", number: "0800 011 3797", how: "Call", hours: "Mon to Fri 9am to 5pm", url: "https://www.moneyhelper.org.uk/en/contact-us", verified: true, verifiedOn: c },
      { name: "StepChange Debt Charity", number: "0800 138 1111", how: "Call", hours: "Mon to Fri 8am to 8pm; Sat 9am to 2pm", url: "https://www.stepchange.org/contact-us.aspx", verified: true, verifiedOn: c },
      { name: "National Debtline", number: "0808 808 4000", how: "Call", hours: "Mon to Fri 9am to 8pm; Sat 9:30am to 1pm", url: "https://nationaldebtline.org/contact-us/", verified: true, verifiedOn: c },
      { name: "Citizens Advice Adviceline (England)", number: "0800 144 8848", how: "Call", hours: "Mon to Fri 9am to 5pm", url: "https://www.citizensadvice.org.uk/about-us/contact-us/contact-us/contact-us/", verified: true, verifiedOn: c },
      { name: "Citizens Advice Advicelink (Wales)", number: "0800 702 2020", how: "Call", hours: "Mon to Fri 8am to 7pm; Sat 9am to 1pm", url: "https://www.citizensadvice.org.uk/wales/about-us/contact-us/contact-us/contact-us/", verified: true, verifiedOn: c },
    ],
  },
  eating_support_lines: {
    GB: [
      { name: "Beat Helpline (England)", number: "0808 801 0677", how: "Call", hours: "Mon to Fri 3pm to 8pm", url: BEAT, verified: true, verifiedOn: c },
      { name: "Beat Helpline (Scotland)", number: "0808 801 0432", how: "Call", hours: "Mon to Fri 3pm to 8pm", url: BEAT, verified: true, verifiedOn: c },
      { name: "Beat Helpline (Wales)", number: "0808 801 0433", how: "Call", hours: "Mon to Fri 3pm to 8pm", url: BEAT, verified: true, verifiedOn: c },
      { name: "Beat Helpline (Northern Ireland)", number: "0808 801 0434", how: "Call", hours: "Mon to Fri 3pm to 8pm", url: BEAT, verified: true, verifiedOn: c },
    ],
  },
  bereavement_support_lines: {
    GB: [
      { name: "Cruse Bereavement Support", number: "0808 808 1677", how: "Call", hours: "Mon, Wed, Thu, Fri 9:30am to 5pm; Tue 1pm to 8pm", url: "https://www.cruse.org.uk/get-support/helpline/", verified: true, verifiedOn: c },
    ],
  },
  new_parent_support_lines: {
    GB: [
      { name: "Family Lives (England and Wales)", number: "0808 800 2222", how: "Call", hours: "Mon to Fri 9am to 9pm; weekends 10am to 3pm", url: "https://www.familylives.org.uk/how-we-can-help/confidential-helpline/", verified: true, verifiedOn: c },
      { name: "PANDAS Foundation (perinatal mental health)", number: "pandasfoundation.org.uk", how: "Website", hours: null, url: "https://pandasfoundation.org.uk/", verified: true, verifiedOn: c },
    ],
  },
  carer_support_lines: {
    GB: [
      { name: "Carers UK Helpline", number: "0808 808 7777", how: "Call", hours: "Mon to Fri 9am to 6pm", url: "https://www.carersuk.org/help-and-advice/helpline-and-other-support/", verified: true, verifiedOn: c },
    ],
  },
};

const SIGNPOST_IDS = new Set<string>(SIGNPOST_GROUPS.map((g) => g.id));

export function isSignpostId(value: string | null | undefined): value is SignpostId {
  return typeof value === "string" && SIGNPOST_IDS.has(value);
}

/**
 * The signpost a title names, for the reader's market, or null when the id
 * is unknown or the market has not been checked. Never falls back to another
 * market's numbers.
 */
export function signpostFor(id: string | null | undefined, market: MarketCode): { id: SignpostId; title: string; lines: readonly SignpostLine[] } | null {
  if (!isSignpostId(id)) return null;
  const lines = SIGNPOST_LINES[id][market] ?? null;
  if (!lines || lines.length === 0) return null;
  const title = SIGNPOST_GROUPS.find((g) => g.id === id)!.title;
  return { id, title, lines };
}

/** The href for a signpost line: as contactHref, or the website when no number is verified. */
export function signpostHref(line: SignpostLine): string {
  if (line.number === null) return line.url;
  return contactHref({ number: line.number, how: line.how, url: line.url });
}
