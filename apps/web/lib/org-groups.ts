/**
 * Akana for organisations, phase 2: groups (F-210 to F-216). Pure helpers
 * shared by the owner's group pages, the leader view at /org/lead, the
 * reports page and the reader's group page. Migration 0028 holds the rules;
 * these only parse forms and choose words. Nothing here ever names a member.
 */

import { toCsv } from "@/lib/dashboards";

/** A row of public.my_org_groups() (0028). */
export interface MyGroup {
  group_id: string;
  group_name: string;
  organisation_name: string;
  organisation_kind: string;
  workbook_title: string;
  workbook_slug: string;
  status: string;
  role: string;
  accepted: boolean;
  offered_role: string | null;
  count_checkins: boolean;
  faith: boolean;
  starts_on: string | null;
  meeting_day: number | null;
  meeting_time: string | null;
  current_unit: number | null;
  current_week: number | null;
  my_choice: string | null;
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

export const CHECKIN_CHOICES = ["doing_fine", "found_it_hard", "missed_this_week"] as const;
export type CheckinChoice = (typeof CHECKIN_CHOICES)[number];
export const CHECKIN_LABELS: Record<CheckinChoice, string> = {
  doing_fine: "Doing fine",
  found_it_hard: "Found it hard",
  missed_this_week: "Missed this week",
};
export function isCheckinChoice(v: unknown): v is CheckinChoice {
  return typeof v === "string" && (CHECKIN_CHOICES as readonly string[]).includes(v);
}

export const GROUP_STATUSES = ["draft", "running", "finished", "archived"] as const;
export type GroupStatus = (typeof GROUP_STATUSES)[number];
export const GROUP_STATUS_LABELS: Record<GroupStatus, string> = {
  draft: "Not started",
  running: "Running",
  finished: "Finished",
  archived: "Archived",
};
/** The moves 0028 allows, as the owner sees them. */
export function nextStatuses(s: string): GroupStatus[] {
  switch (s) {
    case "draft":
      return ["running", "archived"];
    case "running":
      return ["finished"];
    case "finished":
      return ["running", "archived"];
    default:
      return [];
  }
}

export const LEADER_STATE_LABELS: Record<string, string> = {
  none: "Not appointed",
  offered: "Waiting for them to accept",
  accepted: "In place",
  replacing: "In place, new appointment waiting",
};

export const DAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

/** "Tuesdays at 12:30", "Tuesdays", "12:30" or null. */
export function meetingText(day: number | null | undefined, time: string | null | undefined): string | null {
  const d = typeof day === "number" && day >= 1 && day <= 7 ? `${DAY_LABELS[day - 1]}s` : null;
  const t = typeof time === "string" && /^\d{2}:\d{2}/.test(time) ? time.slice(0, 5) : null;
  if (d && t) return `${d} at ${t}`;
  return d ?? t;
}

/**
 * The member's line: "Your group is on week 3". Soft pace: never "behind",
 * never a streak, never a missed-day count.
 */
export function groupWeekLine(week: number | null | undefined, unit: number | null | undefined): string {
  if (!week || !unit) return "Your group has not started yet";
  return week === unit ? `Your group is on week ${week}` : `Your group is on week ${week}, unit ${unit}`;
}

/** Today's date in the UK, yyyy-mm-dd, matching the database's app.london_today(). */
export function londonToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** The short form for tables: "Week 3", "Week 2, unit 5" or "Not started". */
export function weekShort(week: number | null | undefined, unit: number | null | undefined): string {
  if (!week || !unit) return "Not started";
  return week === unit ? `Week ${week}` : `Week ${week}, unit ${unit}`;
}

/** How a count from 0028 is shown. Never a number the database held back. */
export function groupCountText(shown: string | null | undefined, value: number | null | undefined, threshold: number): string {
  switch (shown) {
    case "exact":
      return typeof value === "number" ? String(value) : "Not shown";
    case "fewer_than":
      return `Fewer than ${threshold}`;
    case "nearly_all":
      return "Nearly everyone";
    case "hidden":
      return "Not shown while numbers are small";
    default:
      return "Not shown";
  }
}

// ---------------------------------------------------------------------------
// Group names (F-210): a warning, not a block
// ---------------------------------------------------------------------------

/**
 * Words that would put health, belief or money trouble into a roster that
 * the organisation, the leader and every member can see. A name such as
 * "Anxiety support, Finance team" tells everyone why its members are there.
 */
export const SENSITIVE_NAME_WORDS = [
  "anxiety",
  "anxious",
  "depression",
  "depressed",
  "mental health",
  "panic",
  "trauma",
  "ptsd",
  "grief",
  "bereave",
  "bereavement",
  "addiction",
  "recovery",
  "alcohol",
  "drinking",
  "suicid",
  "self-harm",
  "self harm",
  "eating disorder",
  "ocd",
  "bipolar",
  "burnout",
  "debt",
  "divorce",
  "separation",
  "abuse",
  "illness",
  "cancer",
  "diagnosis",
  "menopause",
  "fertility",
  "miscarriage",
] as const;

export function groupNameWarning(name: string): string | null {
  const n = ` ${name.toLowerCase()} `;
  // A word start is enough ("bereave" finds "bereavement"); short words must stand alone.
  const hit = SENSITIVE_NAME_WORDS.find((w) => {
    const e = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(w.length <= 4 ? `\\b${e}\\b` : `\\b${e}`).test(n);
  });
  if (!hit) return null;
  return `"${hit}" in a group name tells everyone who sees the group list why its members are there. Choose a neutral name, such as the day you meet.`;
}

export function cleanGroupName(v: unknown): string | null {
  const s = typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim() : "";
  if (s.length < 1 || s.length > 60 || /[<>@]/.test(s) || /(https?:|www\.)/i.test(s)) return null;
  return s;
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

type Get = (name: string) => unknown;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuidLike = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function parseDateInput(v: unknown): string | null {
  const s = str(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
}

export function parseMeetingDay(v: unknown): number | null | false {
  const s = str(v);
  if (!s) return null;
  if (!/^[1-7]$/.test(s)) return false;
  return Number(s);
}

export function parseMeetingTime(v: unknown): string | null | false {
  const s = str(v);
  if (!s) return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s);
  return m ? `${m[1]}:${m[2]}` : false;
}

export interface GroupInput {
  name: string;
  starts_on: string | null;
  meeting_day: number | null;
  meeting_time: string | null;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; field: string };

/** Name and timings, shared by create and edit. A sensitive name needs the confirm box. */
export function parseGroupBasics(get: Get): Parsed<GroupInput> {
  const name = cleanGroupName(get("name"));
  if (!name) return { ok: false, field: "name" };
  if (groupNameWarning(name) && get("confirm_name") !== "yes") return { ok: false, field: "name_warning" };
  const startsRaw = str(get("starts_on"));
  const starts = startsRaw ? parseDateInput(startsRaw) : null;
  if (startsRaw && !starts) return { ok: false, field: "starts_on" };
  const day = parseMeetingDay(get("meeting_day"));
  if (day === false) return { ok: false, field: "meeting_day" };
  const time = parseMeetingTime(get("meeting_time"));
  if (time === false) return { ok: false, field: "meeting_time" };
  return { ok: true, value: { name, starts_on: starts, meeting_day: day, meeting_time: time } };
}

/**
 * The schedule editor posts one date input per unit, named date_<unit>.
 * Empty dates are left out (the unit is not scheduled).
 */
export function parseScheduleForm(get: Get, units: readonly number[]): Parsed<{ units: number[]; dates: string[] }> {
  const outU: number[] = [];
  const outD: string[] = [];
  for (const u of units) {
    const raw = str(get(`date_${u}`));
    if (!raw) continue;
    const d = parseDateInput(raw);
    if (!d) return { ok: false, field: `date_${u}` };
    outU.push(u);
    outD.push(d);
  }
  return { ok: true, value: { units: outU, dates: outD } };
}

/** One unit a week from a start date, for the "fill weekly" button. */
export function weeklyDates(units: readonly number[], start: string): string[] {
  const base = new Date(`${start}T00:00:00Z`).getTime();
  return units.map((_, i) => new Date(base + i * 7 * 86_400_000).toISOString().slice(0, 10));
}

export function parseConcern(get: Get): Parsed<{ message: string }> {
  const message = str(get("message")).replace(/\u0000/g, "");
  if (!message || message.length > 4000) return { ok: false, field: "message" };
  if (get("consent") !== "yes") return { ok: false, field: "consent" };
  return { ok: true, value: { message } };
}

// ---------------------------------------------------------------------------
// Reports (F-214)
// ---------------------------------------------------------------------------

export interface ReportRow {
  scope: string;
  licence_id: string;
  group_id: string | null;
  group_name: string | null;
  metric: string;
  value: number | null;
  shown: string;
  threshold: number;
}

export const REPORT_METRIC_LABELS: Record<string, string> = {
  seats_taken: "Seats taken at month end",
  people_started: "People who started a workbook this month",
  members: "Members at month end",
  members_started: "Members who have started the group's workbook",
  checkins_doing_fine: "Check-ins: doing fine",
  checkins_found_it_hard: "Check-ins: found it hard",
  checkins_missed_this_week: "Check-ins: missed this week",
};

/** The first day of a complete month, yyyy-mm-01, from ?month=yyyy-mm. Default: last month. */
export function parseReportMonth(raw: string | string[] | undefined, now: Date = new Date()): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const months = reportMonths(now);
  if (typeof v === "string" && /^\d{4}-\d{2}$/.test(v) && months.includes(`${v}-01`)) return `${v}-01`;
  return months[0]!;
}

/** The last twelve complete months, newest first, as yyyy-mm-01 (UK calendar). */
export function reportMonths(now: Date = new Date()): string[] {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit" }).formatToParts(now);
  let y = Number(parts.find((p) => p.type === "year")!.value);
  let m = Number(parts.find((p) => p.type === "month")!.value);
  const out: string[] = [];
  for (let i = 0; i < 12; i++) {
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
    out.push(`${y}-${String(m).padStart(2, "0")}-01`);
  }
  return out;
}

export function monthName(iso: string): string {
  const d = new Date(`${iso.slice(0, 7)}-01T00:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(d);
}

export function reportCsv(rows: readonly ReportRow[], month: string, licenceLabel: (id: string) => string): string {
  return toCsv(
    ["month", "licence", "group", "measure", "count"],
    rows.map((r) => [
      month.slice(0, 7),
      licenceLabel(r.licence_id),
      r.group_name ?? "",
      REPORT_METRIC_LABELS[r.metric] ?? r.metric,
      groupCountText(r.shown, r.value, r.threshold),
    ]),
  );
}

// ---------------------------------------------------------------------------
// Notices
// ---------------------------------------------------------------------------

export const GROUP_NOTICES = {
  created: { tone: "ok", text: "Group created. Appoint a leader, then set the schedule." },
  saved: { tone: "ok", text: "Saved." },
  appointed: { tone: "ok", text: "Appointment sent. They will see it in their Akana app and can accept or say no." },
  unappointed: { tone: "ok", text: "Role taken back. They stay in the group as a member if they had joined." },
  schedule_saved: { tone: "ok", text: "Schedule saved." },
  joined: { tone: "ok", text: "You have joined the group." },
  accepted: { tone: "ok", text: "You have accepted. The leader view is open to you." },
  left: { tone: "ok", text: "You have left the group." },
  declined: { tone: "ok", text: "You said no. Nothing else changed." },
  checked_in: { tone: "ok", text: "Thank you. Your check-in is saved." },
  counting_on: { tone: "ok", text: "Your check-ins now count in the group's totals." },
  counting_off: { tone: "ok", text: "Your check-ins no longer count in the group's totals." },
  cleared: { tone: "ok", text: "Your check-ins for this group are deleted." },
  concern_sent: { tone: "ok", text: "Thank you. Your report went to the Akana team, not to your group or its leader." },
  invalid: { tone: "error", text: "Check the form. Something is missing or does not fit." },
  name_warning: { tone: "error", text: "That name may tell people why members are in the group. Change it, or tick the box to keep it." },
  denied: { tone: "error", text: "That is not open to you. Nothing changed." },
  faith: { tone: "error", text: "This group needs your faith consent first." },
  no_seat: { tone: "error", text: "You need a seat from this organisation to join its groups." },
  adult: { tone: "error", text: "Groups are for people aged 18 or over. Confirm your age in You first." },
  state: { tone: "error", text: "That cannot be done while the group is in its current state. Nothing changed." },
  deleting: { tone: "error", text: "Your account is set to be deleted, so you cannot join a group." },
  limited: { tone: "error", text: "Too many reports today. If someone is in danger, use Help now." },
  failed: { tone: "error", text: "That did not save. Try again." },
} as const satisfies Record<string, { tone: "ok" | "error"; text: string }>;
export type GroupNotice = keyof typeof GROUP_NOTICES;

export function groupNotice(code: string | string[] | undefined): { tone: "ok" | "error"; text: string } | null {
  const k = Array.isArray(code) ? code[0] : code;
  return k && Object.prototype.hasOwnProperty.call(GROUP_NOTICES, k) ? GROUP_NOTICES[k as GroupNotice] : null;
}

/** Map a 0028 error code to a notice. */
export function groupErrorNotice(code: string | undefined): GroupNotice {
  switch (code) {
    case "AKG01":
    case "42501":
      return "denied";
    case "AKG02":
      return "invalid";
    case "AKG03":
      return "faith";
    case "AKG04":
      return "no_seat";
    case "AKG06":
      return "deleting";
    case "AKG08":
      return "state";
    case "AKG10":
      return "adult";
    case "AKG29":
      return "limited";
    default:
      return "failed";
  }
}

/** Where a notice goes back to, keeping any query string already there. */
export function withNotice(path: string, notice: GroupNotice): string {
  return `${path}${path.includes("?") ? "&" : "?"}notice=${notice}`;
}
