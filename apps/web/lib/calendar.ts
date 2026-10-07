/**
 * The calendar reminder (F-024): one .ics file, made on the reader's device.
 *
 * The event text is neutral by default ("Daily check" or "Workbook time")
 * and never carries a workbook title, a Theme or anything the reader wrote.
 * A reader may type their own words instead; that is their choice and it
 * stays on their device, because the file is built in the browser and
 * never sent anywhere. The UID is random, so the file does not identify
 * the reader either. Times are floating local times, so the reminder
 * follows the phone's own time zone.
 */

export const REMINDER_LABELS = ["Daily check", "Workbook time"] as const;
export type ReminderLabel = (typeof REMINDER_LABELS)[number];

export const CUSTOM_LABEL_MAX = 60;

export interface IcsInput {
  /** "HH:MM", 24-hour. */
  time: string;
  /** The event title. A neutral label unless the reader chose their own words. */
  summary: string;
  /** Day the reminder starts, in local time. */
  start: Date;
  /** Random id made on the device. */
  uid: string;
  /** Where the reminder points, for example https://akana.app/today. */
  url: string;
  /** When the file was made, for DTSTAMP. */
  now?: Date;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** RFC 5545 text escaping: backslash, semicolon, comma and newlines. */
export function icsEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Fold lines longer than 75 octets, as RFC 5545 asks. */
export function icsFold(line: string): string {
  const out: string[] = [];
  let rest = line;
  const enc = new TextEncoder();
  while (enc.encode(rest).length > 75) {
    let cut = 75;
    while (enc.encode(rest.slice(0, cut)).length > 75) cut -= 1;
    out.push(rest.slice(0, cut));
    rest = " " + rest.slice(cut);
  }
  out.push(rest);
  return out.join("\r\n");
}

/** Clean what a reader typed: one line, no control characters, trimmed, capped. */
export function cleanCustomLabel(raw: string): string {
  // Control characters and line breaks become spaces, so the label stays one line.
  return raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, CUSTOM_LABEL_MAX);
}

export function validTime(time: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  return !!m && Number(m[1]) < 24 && Number(m[2]) < 60;
}

export function buildIcs(input: IcsInput): string {
  const [h, m] = validTime(input.time) ? input.time.split(":") : ["08", "00"];
  const d = input.start;
  const ymd = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const now = input.now ?? new Date();
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  const summary = icsEscape(input.summary || REMINDER_LABELS[0]);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Akana//Reminder//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${input.uid}@reminder.akana`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${ymd}T${h}${m}00`,
    "DURATION:PT5M",
    "RRULE:FREQ=DAILY",
    `SUMMARY:${summary}`,
    `DESCRIPTION:${icsEscape(`A few minutes, if you want them. ${input.url}`)}`,
    `URL:${input.url}`,
    "TRANSP:TRANSPARENT",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${summary}`,
    "TRIGGER:PT0M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(icsFold).join("\r\n") + "\r\n";
}
