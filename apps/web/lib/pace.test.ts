import { describe, expect, it } from "vitest";
import { addDays, daysBetween, defaultPace, dueToday, effectivePace, isPace, nextDueDay, nextPartLine, paceChange, paceInputFromEvents, parsePaceForm, paceUnitLabel, reminderAllowedByPace, unitLabel, weekStart } from "./pace";

// 2026-10-26 is a Monday.
const MON = "2026-10-26";
const TUE = "2026-10-27";
const WED = "2026-10-28";
const THU = "2026-10-29";
const SAT = "2026-10-31";
const SUN = "2026-11-01";
const NEXT_MON = "2026-11-02";

describe("pace defaults", () => {
  it("is weekly for week titles and own pace for the rest", () => {
    expect(defaultPace("week")).toBe("weekly");
    for (const u of ["day", "module", "chapter", "part", null, undefined]) expect(defaultPace(u)).toBe("own_pace");
  });

  it("keeps a stored choice and ignores rubbish", () => {
    expect(effectivePace("daily", "week")).toBe("daily");
    expect(effectivePace("fortnightly", "week")).toBe("weekly");
    expect(effectivePace(null, "chapter")).toBe("own_pace");
    expect(isPace("few_times_a_week")).toBe(true);
    expect(isPace("Weekly")).toBe(false);
  });
});

describe("date helpers", () => {
  it("adds days across a month end and finds the Monday", () => {
    expect(addDays(SAT, 2)).toBe(NEXT_MON);
    expect(daysBetween(MON, NEXT_MON)).toBe(7);
    expect(weekStart(SUN)).toBe(MON);
    expect(weekStart(MON)).toBe(MON);
  });
});

describe("nextDueDay", () => {
  it("is today before the first finished step, except on own pace", () => {
    expect(nextDueDay({ pace: "daily", lastFinishedDay: null }, WED)).toBe(WED);
    expect(nextDueDay({ pace: "weekly", lastFinishedDay: null }, WED)).toBe(WED);
    expect(nextDueDay({ pace: "own_pace", lastFinishedDay: null }, WED)).toBeNull();
  });

  it("daily: the day after the last finish", () => {
    expect(nextDueDay({ pace: "daily", lastFinishedDay: TUE }, WED)).toBe(WED);
    expect(nextDueDay({ pace: "daily", lastFinishedDay: SUN }, SUN)).toBe(NEXT_MON);
  });

  it("weekly: the Monday after the week of the last finish", () => {
    expect(nextDueDay({ pace: "weekly", lastFinishedDay: MON }, TUE)).toBe(NEXT_MON);
    expect(nextDueDay({ pace: "weekly", lastFinishedDay: SUN }, SUN)).toBe(NEXT_MON);
  });

  it("few times a week: two days on, at most three a week", () => {
    expect(nextDueDay({ pace: "few_times_a_week", lastFinishedDay: MON, finishedInThatWeek: 1 }, MON)).toBe(WED);
    expect(nextDueDay({ pace: "few_times_a_week", lastFinishedDay: WED, finishedInThatWeek: 3 }, WED)).toBe(NEXT_MON);
    // Two days on from Saturday is past the week end, so the next Monday.
    expect(nextDueDay({ pace: "few_times_a_week", lastFinishedDay: SAT, finishedInThatWeek: 2 }, SAT)).toBe(NEXT_MON);
  });

  it("own pace never has a due day", () => {
    expect(nextDueDay({ pace: "own_pace", lastFinishedDay: MON }, NEXT_MON)).toBeNull();
    expect(dueToday({ pace: "own_pace", lastFinishedDay: MON }, NEXT_MON)).toBe(false);
  });

  it("dueToday compares the due day with today", () => {
    expect(dueToday({ pace: "daily", lastFinishedDay: WED }, WED)).toBe(false);
    expect(dueToday({ pace: "daily", lastFinishedDay: WED }, THU)).toBe(true);
    expect(dueToday({ pace: "weekly", lastFinishedDay: MON }, SUN)).toBe(false);
    expect(dueToday({ pace: "weekly", lastFinishedDay: MON }, NEXT_MON)).toBe(true);
  });
});

describe("reminderAllowedByPace", () => {
  it("sends on a scheduled pace only on a due day", () => {
    expect(reminderAllowedByPace({ pace: "weekly", lastFinishedDay: TUE, lastReminderDay: null }, THU)).toBe(false);
    expect(reminderAllowedByPace({ pace: "weekly", lastFinishedDay: TUE, lastReminderDay: null }, NEXT_MON)).toBe(true);
    expect(reminderAllowedByPace({ pace: "daily", lastFinishedDay: TUE, lastReminderDay: null }, WED)).toBe(true);
  });

  it("sends at most one gentle reminder a week on own pace, after a quiet week", () => {
    expect(reminderAllowedByPace({ pace: "own_pace", lastFinishedDay: TUE, lastReminderDay: null }, THU)).toBe(false);
    expect(reminderAllowedByPace({ pace: "own_pace", lastFinishedDay: "2026-10-19", lastReminderDay: null }, MON)).toBe(true);
    expect(reminderAllowedByPace({ pace: "own_pace", lastFinishedDay: "2026-10-19", lastReminderDay: "2026-10-24" }, MON)).toBe(false);
    expect(reminderAllowedByPace({ pace: "own_pace", lastFinishedDay: "2026-10-12", lastReminderDay: "2026-10-19" }, MON)).toBe(true);
    expect(reminderAllowedByPace({ pace: "own_pace", lastFinishedDay: null, lastActiveDay: SAT, lastReminderDay: null }, NEXT_MON)).toBe(false);
  });
});

describe("labels", () => {
  it("labels every unit word, including part", () => {
    expect(unitLabel("part")).toBe("Part");
    expect(unitLabel("chapter")).toBe("Chapter");
    expect(unitLabel("unit")).toBe("Unit");
  });

  it("says Part for a week title read at any pace but weekly", () => {
    expect(paceUnitLabel("week", "weekly")).toBe("Week");
    expect(paceUnitLabel("week", "daily")).toBe("Part");
    expect(paceUnitLabel("week", "own_pace")).toBe("Part");
    expect(paceUnitLabel("chapter", "daily")).toBe("Chapter");
  });

  it("writes the next part line without counting days", () => {
    expect(nextPartLine({ unit: "week", pace: "daily", number: 2, count: 4, due: true })).toBe("Your next part is ready. Part 2 of 4.");
    expect(nextPartLine({ unit: "chapter", pace: "few_times_a_week", number: 3, count: null, due: false })).toBe("Your next part is there whenever you want it. Chapter 3.");
    expect(nextPartLine({ unit: "part", pace: "own_pace", number: 1, count: 6, due: false })).toBe("Your next part, at your own pace. Part 1 of 6.");
  });
});

describe("paceInputFromEvents", () => {
  const day = (d: Date) => d.toISOString().slice(0, 10);
  it("finds the last finished day and the steps in its week, ignoring repeats", () => {
    const events = [
      { kind: "step_done", ref: "a", at: "2026-10-26T09:00:00Z" },
      { kind: "step_done", ref: "b", at: "2026-10-28T09:00:00Z" },
      { kind: "step_done", ref: "b~r", at: "2026-10-29T09:00:00Z" },
      { kind: "unit_opened", ref: "3", at: "2026-10-30T09:00:00Z" },
      { kind: "step_done", ref: "z", at: "2026-10-20T09:00:00Z" },
    ];
    expect(paceInputFromEvents("few_times_a_week", events, day)).toEqual({ pace: "few_times_a_week", lastFinishedDay: WED, finishedInThatWeek: 2 });
  });

  it("is empty before the first finish", () => {
    expect(paceInputFromEvents("daily", [], day)).toEqual({ pace: "daily", lastFinishedDay: null, finishedInThatWeek: 0 });
  });
});

describe("pace form", () => {
  const id = "a6900000-0000-0000-0000-0000000000e1";
  it("checks one change", () => {
    expect(paceChange(id, "daily")).toEqual({ enrolmentId: id, pace: "daily" });
    expect(paceChange("not-an-id", "daily")).toBeNull();
    expect(paceChange(id, "hourly")).toBeNull();
  });

  it("reads the one enrolment the form is for", () => {
    const f = new FormData();
    f.set("enrolment_id", id);
    f.set("pace", "few_times_a_week");
    f.set("goal", "2");
    expect(parsePaceForm(f)).toEqual({ enrolmentId: id, pace: "few_times_a_week" });
    f.set("enrolment_id", "bad");
    expect(parsePaceForm(f)).toBeNull();
  });
});
