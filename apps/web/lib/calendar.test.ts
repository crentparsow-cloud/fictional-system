import { describe, expect, it } from "vitest";
import { buildIcs, cleanCustomLabel, icsEscape, icsFold, validTime } from "./calendar";

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
