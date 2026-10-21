import { describe, expect, it } from "vitest";
import { buildSessionIcs, sessionDates, SESSION_LABEL_DEFAULT } from "./calendar";

const now = new Date(Date.UTC(2026, 9, 7, 10, 0, 0));
const base = { firstDate: "2026-11-03", time: "19:30", durationMinutes: 90, everyDays: 7, sessions: 3, label: "", uid: "s1", url: "https://akana.example/org/lead/x/kit", now };

describe("sessionDates", () => {
  it("steps by the gap across month ends", () => {
    expect(sessionDates("2026-11-24", 7, 3)).toEqual(["2026-11-24", "2026-12-01", "2026-12-08"]);
    expect(sessionDates("2026-12-30", 14, 2)).toEqual(["2026-12-30", "2027-01-13"]);
  });
  it("refuses bad input", () => {
    expect(sessionDates("2026-02-30", 7, 3)).toEqual([]);
    expect(sessionDates("3 Nov", 7, 3)).toEqual([]);
    expect(sessionDates("2026-11-03", 0, 3)).toEqual([]);
    expect(sessionDates("2026-11-03", 7, 0)).toEqual([]);
    expect(sessionDates("2026-11-03", 7, 53)).toEqual([]);
  });
});

describe("buildSessionIcs", () => {
  it("makes one timed event per session with a neutral title", () => {
    const ics = buildSessionIcs(base)!;
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(3);
    expect(ics).toContain("DTSTART:20261103T193000");
    expect(ics).toContain("DTEND:20261103T210000");
    expect(ics).toContain(`SUMMARY:${SESSION_LABEL_DEFAULT} 2 of 3`);
    expect(ics).toContain("DTSTART:20261117T193000");
    expect(ics).not.toContain("RRULE");
    expect(ics.endsWith("\r\n")).toBe(true);
  });
  it("uses the leader's own words when given, cleaned", () => {
    expect(buildSessionIcs({ ...base, label: "  Tuesday\ncircle " })).toContain("SUMMARY:Tuesday circle 1 of 3");
  });
  it("rolls a late session over midnight", () => {
    expect(buildSessionIcs({ ...base, time: "23:30", durationMinutes: 60, sessions: 1 })).toContain("DTEND:20261104T003000");
  });
  it("clamps the length and returns null for unusable input", () => {
    expect(buildSessionIcs({ ...base, durationMinutes: 1, sessions: 1 })).toContain("DTEND:20261103T194000");
    expect(buildSessionIcs({ ...base, time: "25:00" })).toBeNull();
    expect(buildSessionIcs({ ...base, firstDate: "" })).toBeNull();
  });
  it("names no workbook", () => {
    expect(buildSessionIcs(base)!.toLowerCase()).not.toContain("workbook");
  });
});
