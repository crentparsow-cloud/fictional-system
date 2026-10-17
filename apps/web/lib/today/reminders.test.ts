import { describe, expect, it } from "vitest";
import { step } from "@/lib/today/fixtures";
import {
  DEFAULT_STOP_AFTER,
  localParts,
  nameStep,
  oneProgrammePerReader,
  parseTime,
  reminderAction,
  reminderDue,
  reminderKey,
  sentSinceActivity,
  stoppingKey,
  validTimeZone,
  welcomeBackKey,
} from "@/lib/today/reminders";

describe("localParts", () => {
  it("gives the reader's own date, weekday and minutes", () => {
    expect(localParts(new Date("2026-10-12T08:30:00Z"), "Europe/London")).toEqual({ date: "2026-10-12", isoDow: 1, minutes: 9 * 60 + 30 }); // BST
    expect(localParts(new Date("2026-12-14T08:30:00Z"), "Europe/London")).toEqual({ date: "2026-12-14", isoDow: 1, minutes: 8 * 60 + 30 }); // GMT
    expect(localParts(new Date("2026-10-11T23:30:00Z"), "Pacific/Auckland").isoDow).toBe(1);
  });
  it("reads midnight as 00 and not 24", () => {
    expect(localParts(new Date("2026-12-14T00:05:00Z"), "Europe/London").minutes).toBe(5);
  });
});

describe("time and zone checks", () => {
  it("parses HH:MM and rejects the rest", () => {
    expect(parseTime("09:00")).toBe(540);
    expect(parseTime("9:05")).toBe(545);
    expect(parseTime("09:00:00")).toBe(540);
    expect(parseTime("24:00")).toBeNull();
    expect(parseTime("nine")).toBeNull();
  });
  it("knows a time zone from a made-up one", () => {
    expect(validTimeZone("Europe/London")).toBe(true);
    expect(validTimeZone("Mars/Olympus")).toBe(false);
  });
});

describe("reminderDue", () => {
  const setting = { enabled: true, days: [1, 3, 5], time: "09:00", timeZone: "Europe/London" };
  it("is due on a chosen day from the chosen time, for three hours", () => {
    // Monday 12 October 2026, BST: 09:00 local is 08:00 UTC.
    expect(reminderDue(setting, new Date("2026-10-12T07:59:00Z")).due).toBe(false);
    expect(reminderDue(setting, new Date("2026-10-12T08:00:00Z"))).toEqual({ due: true, localDate: "2026-10-12" });
    expect(reminderDue(setting, new Date("2026-10-12T10:59:00Z")).due).toBe(true);
    expect(reminderDue(setting, new Date("2026-10-12T11:01:00Z")).due).toBe(false);
  });
  it("is not due on a day the reader did not choose", () => {
    expect(reminderDue(setting, new Date("2026-10-13T08:30:00Z")).due).toBe(false); // Tuesday
  });
  it("is never due when reminders are off or no day is chosen", () => {
    expect(reminderDue({ ...setting, enabled: false }, new Date("2026-10-12T08:30:00Z")).due).toBe(false);
    expect(reminderDue({ ...setting, days: [] }, new Date("2026-10-12T08:30:00Z")).due).toBe(false);
  });
  it("follows the clocks changing", () => {
    // Monday 26 October 2026 is the first GMT Monday: 09:00 local is 09:00 UTC.
    expect(reminderDue(setting, new Date("2026-10-26T08:30:00Z")).due).toBe(false);
    expect(reminderDue(setting, new Date("2026-10-26T09:10:00Z")).due).toBe(true);
  });
  it("falls back to London for a zone it does not know", () => {
    expect(reminderDue({ ...setting, timeZone: "Nowhere/Land" }, new Date("2026-10-12T08:30:00Z")).due).toBe(true);
  });
});

describe("the stop rule (14.3)", () => {
  it("stops after 4 by default", () => {
    expect(DEFAULT_STOP_AFTER).toBe(4);
  });
  it("sends reminders until N are unanswered, then the one stopping email", () => {
    const at = (n: number) => reminderAction({ enabled: true, sentSinceActivity: n, stopAfter: 4 });
    expect([at(0), at(1), at(2), at(3)]).toEqual(["send", "send", "send", "send"]);
    expect(at(4)).toBe("stop_notice");
    expect(at(9)).toBe("stop_notice");
  });
  it("does nothing when reminders are off", () => {
    expect(reminderAction({ enabled: false, sentSinceActivity: 9, stopAfter: 4 })).toBe("none");
  });
  it("takes N from config and never lets it fall below one", () => {
    expect(reminderAction({ enabled: true, sentSinceActivity: 2, stopAfter: 2 })).toBe("stop_notice");
    expect(reminderAction({ enabled: true, sentSinceActivity: 0, stopAfter: 0 })).toBe("send");
    expect(reminderAction({ enabled: true, sentSinceActivity: 4, stopAfter: Number.NaN })).toBe("stop_notice");
  });
  it("counts only reminders sent after the reader last did something", () => {
    const sent = ["2026-09-02T08:00:00Z", "2026-09-04T08:00:00Z", "2026-09-06T08:00:00Z"];
    expect(sentSinceActivity(sent, null)).toBe(3);
    expect(sentSinceActivity(sent, new Date("2026-09-05T00:00:00Z"))).toBe(1);
    expect(sentSinceActivity(sent, new Date("2026-09-07T00:00:00Z"))).toBe(0);
  });
});

describe("idempotency keys", () => {
  it("name the reader, programme, step and local day, and hold no address", () => {
    const k = reminderKey("11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222", "plan_first_step", "2026-10-12");
    expect(k).toBe("step-reminder:11111111-1111-1111-1111-111111111111:22222222-2222-2222-2222-222222222222:plan_first_step:2026-10-12");
    expect(k).not.toContain("@");
    expect(k.length).toBeLessThan(200);
    expect(stoppingKey("e1", "2026-10-12")).toBe("reminder-stop:e1:2026-10-12");
    expect(welcomeBackKey("e1", new Date("2026-09-20T10:00:00Z"))).toBe("welcome-back:e1:2026-09-20");
  });
  it("differs by step and by day", () => {
    const a = reminderKey("u", "e", "s1", "2026-10-12");
    expect(a).not.toBe(reminderKey("u", "e", "s2", "2026-10-12"));
    expect(a).not.toBe(reminderKey("u", "e", "s1", "2026-10-14"));
  });
});

describe("nameStep", () => {
  const s = step(3, "x", { unitName: "Plan your first small step" });
  it("names an ordinary title's step by its unit name", () => {
    expect(nameStep(s, "week", ["A Book Title", null], "none")).toEqual({
      stepName: "Plan your first small step",
      unitWords: "Week 3",
      subjectLabel: "Plan your first small step",
    });
  });
  it("uses the unit number alone in the subject for a wellbeing title", () => {
    const n = nameStep(step(3, "x", { unitName: "Facing panic" }), "week", [], "standard");
    expect(n.subjectLabel).toBe("Week 3");
    expect(n.stepName).toBe("Facing panic");
    expect(nameStep(step(3, "x", { unitName: "Facing panic" }), "week", [], "higher").subjectLabel).toBe("Week 3");
  });
  it("never lets the workbook title through, even inside a unit name", () => {
    const n = nameStep(step(2, "x", { unitName: "Wired Differently: the first week" }), "week", ["Wired Differently", "Wired"], "none");
    expect(n.stepName).toBe("Week 2");
    expect(n.subjectLabel).toBe("Week 2");
  });
  it("falls back to the number for a blank name and shortens a long one", () => {
    expect(nameStep(step(5, "x", { unitName: "  " }), "day", [], "none").stepName).toBe("Day 5");
    const long = nameStep(step(1, "x", { unitName: "A".repeat(80) }), "week", [], "none");
    expect(long.subjectLabel.length).toBeLessThanOrEqual(48);
    expect(long.subjectLabel.endsWith("...")).toBe(true);
  });
});

describe("oneProgrammePerReader", () => {
  it("keeps the programme opened last", () => {
    const out = oneProgrammePerReader([
      { userId: "u1", lastOpenedAt: "2026-10-01T00:00:00Z", id: "a" },
      { userId: "u1", lastOpenedAt: "2026-10-05T00:00:00Z", id: "b" },
      { userId: "u2", lastOpenedAt: "2026-10-02T00:00:00Z", id: "c" },
    ]);
    expect(out.map((o) => o.id).sort()).toEqual(["b", "c"]);
  });
});
