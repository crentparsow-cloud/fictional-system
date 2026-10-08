import { describe, expect, it } from "vitest";
import { buildGroupIcs, buildIcs, cleanCustomLabel, GROUP_LABEL_DEFAULT, icsEscape, icsFold, validTime } from "./calendar";

describe("calendar reminder (F-024)", () => {
  const base = { time: "08:30", summary: "Daily check", start: new Date(2026, 9, 8), uid: "abc123", url: "https://akana.example/today", now: new Date(Date.UTC(2026, 9, 7, 10, 0, 0)) };

  it("builds a daily floating-time event with the neutral label and no title", () => {
    const ics = buildIcs(base);
    expect(ics).toContain("DTSTART:20261008T083000\r\n");
    expect(ics).toContain("RRULE:FREQ=DAILY\r\n");
    expect(ics).toContain("SUMMARY:Daily check\r\n");
    expect(ics).toContain("UID:abc123@reminder.akana\r\n");
    expect(ics).toContain("DTSTAMP:20261007T100000Z\r\n");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    // Every line is CRLF terminated and none is longer than 75 octets.
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });

  it("uses the reader's own words only when they give them, escaped", () => {
    const ics = buildIcs({ ...base, summary: "Me time; tea, then pages" });
    expect(ics).toContain("SUMMARY:Me time\; tea\\, then pages");
    expect(buildIcs({ ...base, summary: "" })).toContain("SUMMARY:Daily check");
  });

  it("falls back to 08:00 for a broken time", () => {
    expect(validTime("25:00")).toBe(false);
    expect(buildIcs({ ...base, time: "nonsense" })).toContain("T080000");
  });

  it("cleans custom labels to one short line", () => {
    expect(cleanCustomLabel("  two\nlines\tand   spaces ")).toBe("two lines and spaces");
    expect(cleanCustomLabel("x".repeat(100))).toHaveLength(60);
    expect(icsEscape("a\\b")).toBe("a\\\\b");
    expect(icsFold("y".repeat(80))).toBe("y".repeat(75) + "\r\n " + "y".repeat(5));
  });
});

describe("group calendar file (F-211)", () => {
  const now = new Date(Date.UTC(2026, 9, 7, 10, 0, 0));
  const units = [
    { unit_number: 2, opens_on: "2026-10-19" },
    { unit_number: 1, opens_on: "2026-10-12" },
    { unit_number: 3, opens_on: "2026-10-31" },
  ];

  it("makes one all-day event per unit date, in date order, with neutral words", () => {
    const ics = buildGroupIcs({ units, label: GROUP_LABEL_DEFAULT, uid: "g1", url: "https://akana.example/groups", now });
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(3);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261012\r\nDTEND;VALUE=DATE:20261013\r\n");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261031\r\nDTEND;VALUE=DATE:20261101\r\n");
    expect(ics.indexOf("unit 1 opens")).toBeLessThan(ics.indexOf("unit 2 opens"));
    expect(ics).toContain("SUMMARY:Group: unit 1 opens\r\n");
    expect(ics).toContain("UID:g1-3@group.akana\r\n");
    expect(ics).not.toMatch(/RRULE|VALARM|behind|missed|streak/i);
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });

  it("uses a title or the member's words only when they choose them, cleaned and escaped", () => {
    const ics = buildGroupIcs({ units: units.slice(0, 1), label: "Tea, pages\nand rest", uid: "g1", url: "https://akana.example/groups", now });
    expect(ics).toContain("SUMMARY:Tea\\, pages and rest: unit 2 opens");
    expect(buildGroupIcs({ units: units.slice(0, 1), label: "  ", uid: "g1", url: "u", now })).toContain("SUMMARY:Group: unit 2 opens");
  });

  it("drops bad dates, bad unit numbers and repeats, and still makes a valid file when nothing is left", () => {
    const ics = buildGroupIcs({
      units: [
        { unit_number: 1, opens_on: "2026-02-30" },
        { unit_number: 0, opens_on: "2026-10-12" },
        { unit_number: 4, opens_on: "12/10/2026" },
        { unit_number: 5, opens_on: "2026-11-02" },
        { unit_number: 5, opens_on: "2026-11-09" },
      ],
      label: GROUP_LABEL_DEFAULT,
      uid: "g1",
      url: "u",
      now,
    });
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain("20261102");
    const empty = buildGroupIcs({ units: [], label: "", uid: "g1", url: "u", now });
    expect(empty).toBe("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Akana//Group schedule//EN\r\nCALSCALE:GREGORIAN\r\nEND:VCALENDAR\r\n");
  });
});
