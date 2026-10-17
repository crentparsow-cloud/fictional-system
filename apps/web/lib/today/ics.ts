import { icsFold } from "@/lib/calendar";
import { localParts } from "@/lib/today/reminders";
import type { ProgrammeStep } from "@/lib/today/steps";

/**
 * The calendar feed for one programme (4.8): the steps still to do, one
 * all-day event each, placed on the reader's chosen weekdays. The feed
 * carries unit names (or just "Week 3" for a wellbeing title) and a link. It
 * never carries an answer, a field label or the workbook title.
 */

export const MAX_FEED_EVENTS = 120;

/** RFC 5545 text escaping. */
export function icsText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
const compact = (iso: string) => iso.replace(/-/g, "");
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return dateOnly(d);
};
const isoDowOf = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay() || 7;

/**
 * Puts each remaining step on the next chosen weekday, one step a day,
 * starting today (in the reader's zone). With no chosen days there are no
 * events: the feed is empty until the reader picks some.
 */
export function scheduleSteps<T>(steps: readonly T[], days: readonly number[], now: Date, timeZone: string, max = MAX_FEED_EVENTS): { date: string; step: T }[] {
  const chosen = new Set(days.filter((d) => d >= 1 && d <= 7));
  if (!chosen.size) return [];
  const out: { date: string; step: T }[] = [];
  let cursor = localParts(now, timeZone).date;
  let guard = 0;
  for (const step of steps.slice(0, max)) {
    while (!chosen.has(isoDowOf(cursor)) && guard++ < 400) cursor = addDays(cursor, 1);
    out.push({ date: cursor, step });
    cursor = addDays(cursor, 1);
  }
  return out;
}

export interface FeedStep {
  step: Pick<ProgrammeStep, "unit" | "exerciseId" | "indexInUnit" | "countInUnit">;
  /** What the event says: a unit name or "Week 3". */
  name: string;
}

export interface FeedInput {
  /** Stable, opaque id for this programme's feed: not the enrolment id itself. */
  feedId: string;
  items: readonly { date: string; item: FeedStep }[];
  openUrl: string;
  now: Date;
}

export function buildFeed(input: FeedInput): string {
  const stamp = input.now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines: string[] = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Akana//Programme steps//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Akana steps", "REFRESH-INTERVAL;VALUE=DURATION:PT12H", "X-PUBLISHED-TTL:PT12H"];
  for (const { date, item } of input.items) {
    const many = item.step.countInUnit > 1 ? ` (${item.step.indexInUnit + 1} of ${item.step.countInUnit})` : "";
    lines.push(
      "BEGIN:VEVENT",
      `UID:${input.feedId}-${item.step.unit}-${item.step.exerciseId.replace(/[^a-z0-9_-]/gi, "")}@akana`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(date)}`,
      `DTEND;VALUE=DATE:${compact(addDays(date, 1))}`,
      `SUMMARY:${icsText(`Akana today: ${item.name}${many}`)}`,
      `DESCRIPTION:${icsText(`Open today's step: ${input.openUrl}`)}`,
      `URL:${input.openUrl}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(icsFold).join("\r\n") + "\r\n";
}
