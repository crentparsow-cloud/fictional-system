/**
 * The author onboarding pack (build list 14.30): help by task, the monthly
 * live Q&A dates and five short videos. Pure, with the environment passed in
 * so the tests need no setup.
 *
 * The dates and the videos come from configuration, not from the code, so the
 * team can fill them in without a release:
 *   STUDIO_QA_DATES  comma separated ISO dates with a time, such as
 *                    2026-11-12T17:00:00Z. Past dates are not shown.
 *   STUDIO_QA_URL    where to join, a https address. Shown beside the dates.
 *   STUDIO_VIDEOS    a JSON list of up to five {"title":"...","url":"https://..."}
 *                    entries. Any entry without a title or a https address is
 *                    dropped.
 * While these are blank the page says nothing about them: the Q&A block shows
 * "Dates will be announced here" and the video slots do not appear at all.
 * Videos open on their own host in a new tab. Nothing is embedded, so no third
 * party script or frame loads on the page.
 */

export interface HelpTask {
  title: string;
  line: string;
  href: string;
}

/** Help by task, in the order an author meets them. Every link is a page that exists. */
export const HELP_TASKS: readonly HelpTask[] = [
  { title: "Plan your programme", line: "Answer five questions and get a unit-by-unit outline to edit.", href: "/studio/outline" },
  { title: "Write to the house rules", line: "Plain English, short sentences, what we do and do not claim.", href: "/how-to-write" },
  { title: "Build a unit", line: "Edit units, key ideas and exercises in a form, and save a draft.", href: "/studio/workbooks" },
  { title: "Understand review", line: "What checks happen, who signs off and what happens next.", href: "/studio/help/review" },
  { title: "Choose a price", line: "The price ladder, the membership and your share.", href: "/studio/help/pricing" },
  { title: "Get paid", line: "Setting up payouts, when money is paid and how to read a statement.", href: "/studio/help/payments" },
  { title: "Read your numbers", line: "How many readers started and finished, with small counts hidden.", href: "/studio/dashboard" },
  { title: "Ask a question of your readers", line: "One optional question at the end of a programme.", href: "/studio/workbooks" },
];

export const MAX_VIDEOS = 5;
export const MAX_QA_DATES = 6;

export interface QaDate {
  iso: string;
  label: string;
}

export interface VideoSlot {
  title: string;
  url: string;
}

export interface OnboardingConfig {
  qaDates: QaDate[];
  qaUrl: string | null;
  videos: VideoSlot[];
}

export function httpsOnly(v: unknown): string | null {
  if (typeof v !== "string") return null;
  try {
    const u = new URL(v.trim());
    return u.protocol === "https:" && u.hostname.includes(".") && !u.username && !u.password ? u.toString() : null;
  } catch {
    return null;
  }
}

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/London",
  timeZoneName: "short",
});

/** Future dates only, soonest first, formatted in UK time. Anything that is not a date is dropped. */
export function parseQaDates(raw: string | undefined, now: Date = new Date()): QaDate[] {
  if (!raw || !raw.trim()) return [];
  const out: QaDate[] = [];
  for (const part of raw.split(",")) {
    const t = Date.parse(part.trim());
    if (!Number.isFinite(t) || t <= now.getTime()) continue;
    out.push({ iso: new Date(t).toISOString(), label: dateFormat.format(new Date(t)) });
  }
  const unique = [...new Map(out.map((d) => [d.iso, d])).values()];
  return unique.sort((a, b) => a.iso.localeCompare(b.iso)).slice(0, MAX_QA_DATES);
}

export function parseVideos(raw: string | undefined): VideoSlot[] {
  if (!raw || !raw.trim()) return [];
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  const out: VideoSlot[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const title = typeof (item as { title?: unknown }).title === "string" ? (item as { title: string }).title.trim().slice(0, 120) : "";
    const url = httpsOnly((item as { url?: unknown }).url);
    if (title && url) out.push({ title, url });
    if (out.length >= MAX_VIDEOS) break;
  }
  return out;
}

export function onboardingConfig(env: Record<string, string | undefined> = process.env, now: Date = new Date()): OnboardingConfig {
  return {
    qaDates: parseQaDates(env.STUDIO_QA_DATES, now),
    qaUrl: httpsOnly(env.STUDIO_QA_URL),
    videos: parseVideos(env.STUDIO_VIDEOS),
  };
}
