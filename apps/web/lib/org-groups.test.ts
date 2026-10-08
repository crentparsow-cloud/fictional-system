import { describe, expect, it } from "vitest";
import {
  CHECKIN_LABELS,
  GROUP_NOTICES,
  cleanGroupName,
  groupCountText,
  groupErrorNotice,
  groupNameWarning,
  groupWeekLine,
  meetingText,
  nextStatuses,
  parseConcern,
  parseGroupBasics,
  parseReportMonth,
  parseScheduleForm,
  reportCsv,
  reportMonths,
  weeklyDates,
} from "./org-groups";

const getter = (o: Record<string, string>) => (k: string) => o[k];

describe("group names", () => {
  it("warns on words that reveal why people are in a group", () => {
    expect(groupNameWarning("Anxiety support, Finance team")).toMatch(/anxiety/);
    expect(groupNameWarning("Grief circle")).toMatch(/grief/);
    expect(groupNameWarning("Bereavement group")).toMatch(/bereave/);
    expect(groupNameWarning("OCD group")).toMatch(/ocd/);
  });
  it("leaves neutral names alone", () => {
    expect(groupNameWarning("Tuesday lunch group")).toBeNull();
    expect(groupNameWarning("Hispanic heritage book club")).toBeNull();
    expect(groupNameWarning("Docs team")).toBeNull();
  });
  it("cleans and refuses links and markup", () => {
    expect(cleanGroupName("  Tuesday   group ")).toBe("Tuesday group");
    expect(cleanGroupName("see www.example.com")).toBeNull();
    expect(cleanGroupName("<b>x</b>")).toBeNull();
    expect(cleanGroupName("a".repeat(61))).toBeNull();
  });
  it("needs the confirm box for a sensitive name", () => {
    expect(parseGroupBasics(getter({ name: "Debt help" }))).toEqual({ ok: false, field: "name_warning" });
    const r = parseGroupBasics(getter({ name: "Debt help", confirm_name: "yes", meeting_day: "2", meeting_time: "12:30" }));
    expect(r).toEqual({ ok: true, value: { name: "Debt help", starts_on: null, meeting_day: 2, meeting_time: "12:30" } });
    expect(parseGroupBasics(getter({ name: "Tuesday", meeting_time: "25:00" }))).toEqual({ ok: false, field: "meeting_time" });
  });
});

describe("pace words", () => {
  it("says which week the group is on and never anything about being behind", () => {
    expect(groupWeekLine(3, 3)).toBe("Your group is on week 3");
    expect(groupWeekLine(2, 5)).toBe("Your group is on week 2, unit 5");
    expect(groupWeekLine(null, null)).toBe("Your group has not started yet");
    for (const s of [groupWeekLine(3, 3), groupWeekLine(null, null)]) expect(s).not.toMatch(/behind|streak|missed/i);
  });
  it("shows the meeting time", () => {
    expect(meetingText(2, "12:30:00")).toBe("Tuesdays at 12:30");
    expect(meetingText(null, null)).toBeNull();
  });
  it("only offers the status moves 0028 allows", () => {
    expect(nextStatuses("running")).toEqual(["finished"]);
    expect(nextStatuses("archived")).toEqual([]);
  });
});

describe("counts", () => {
  it("never shows a number the database held back", () => {
    expect(groupCountText("exact", 7, 5)).toBe("7");
    expect(groupCountText("fewer_than", null, 5)).toBe("Fewer than 5");
    expect(groupCountText("fewer_than", 2, 5)).toBe("Fewer than 5");
    expect(groupCountText("hidden", 3, 5)).not.toMatch(/\d/);
    expect(groupCountText("nearly_all", null, 5)).toBe("Nearly everyone");
  });
  it("has exactly the three fixed check-in choices", () => {
    expect(Object.values(CHECKIN_LABELS)).toEqual(["Doing fine", "Found it hard", "Missed this week"]);
  });
});

describe("schedule form", () => {
  it("reads one date per unit and skips blanks", () => {
    const r = parseScheduleForm(getter({ date_1: "2026-10-05", date_3: "2026-10-19" }), [1, 2, 3]);
    expect(r).toEqual({ ok: true, value: { units: [1, 3], dates: ["2026-10-05", "2026-10-19"] } });
    expect(parseScheduleForm(getter({ date_1: "2026-02-30" }), [1])).toEqual({ ok: false, field: "date_1" });
  });
  it("fills one unit a week", () => {
    expect(weeklyDates([1, 2, 3], "2026-10-05")).toEqual(["2026-10-05", "2026-10-12", "2026-10-19"]);
  });
});

describe("report a concern", () => {
  it("needs a message and consent", () => {
    expect(parseConcern(getter({ message: "x" }))).toEqual({ ok: false, field: "consent" });
    expect(parseConcern(getter({ consent: "yes" }))).toEqual({ ok: false, field: "message" });
    expect(parseConcern(getter({ message: " Something worries me ", consent: "yes" }))).toEqual({ ok: true, value: { message: "Something worries me" } });
  });
});

describe("reports", () => {
  it("offers complete months only, defaulting to last month", () => {
    const now = new Date("2026-10-08T10:00:00Z");
    expect(reportMonths(now)[0]).toBe("2026-09-01");
    expect(reportMonths(now)).toHaveLength(12);
    expect(parseReportMonth(undefined, now)).toBe("2026-09-01");
    expect(parseReportMonth("2026-10", now)).toBe("2026-09-01");
    expect(parseReportMonth("2026-03", now)).toBe("2026-03-01");
  });
  it("writes counts, not numbers held back, and no names", () => {
    const csv = reportCsv(
      [
        { scope: "group", licence_id: "l1", group_id: "g1", group_name: "Tuesday", metric: "members", value: 9, shown: "exact", threshold: 5 },
        { scope: "group", licence_id: "l1", group_id: "g1", group_name: "Tuesday", metric: "checkins_found_it_hard", value: null, shown: "fewer_than", threshold: 5 },
      ],
      "2026-09-01",
      () => "Teams licence",
    );
    expect(csv).toContain("2026-09,Teams licence,Tuesday,Members at month end,9");
    expect(csv).toContain("Check-ins: found it hard,Fewer than 5");
  });
});

describe("errors", () => {
  it("maps every 0028 code to a notice that exists", () => {
    for (const c of ["AKG01", "AKG02", "AKG03", "AKG04", "AKG06", "AKG08", "AKG10", "AKG29", "XX000", undefined]) {
      expect(GROUP_NOTICES[groupErrorNotice(c)]).toBeTruthy();
    }
  });
  it("uses no em dashes in any notice", () => {
    for (const n of Object.values(GROUP_NOTICES)) expect(n.text).not.toMatch(/—|–/);
  });
});
