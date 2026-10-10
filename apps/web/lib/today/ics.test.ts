import { describe, expect, it } from "vitest";
import { step } from "@/lib/today/fixtures";
import { buildFeed, icsText, MAX_FEED_EVENTS, scheduleSteps } from "@/lib/today/ics";

const now = new Date("2026-10-10T09:00:00Z"); // Saturday

describe("scheduleSteps", () => {
  const steps = ["a", "b", "c", "d"].map((id, i) => step(Math.floor(i / 2) + 1, id));

  it("puts one step on each chosen weekday, starting today", () => {
    const out = scheduleSteps(steps, [1, 3, 5], now, "Europe/London");
    expect(out.map((o) => o.date)).toEqual(["2026-10-12", "2026-10-14", "2026-10-16", "2026-10-19"]);
    expect(out.map((o) => o.step.exerciseId)).toEqual(["a", "b", "c", "d"]);
  });

  it("can start today when today is a chosen day", () => {
    expect(scheduleSteps(steps, [6], now, "Europe/London").map((o) => o.date)[0]).toBe("2026-10-10");
  });

  it("uses the reader's own date", () => {
    // 23:30 UTC on Saturday is already Sunday in Auckland.
    const late = new Date("2026-10-10T23:30:00Z");
    expect(scheduleSteps(steps, [7], late, "Pacific/Auckland")[0]?.date).toBe("2026-10-11");
  });

  it("makes no events when no day is chosen", () => {
    expect(scheduleSteps(steps, [], now, "Europe/London")).toEqual([]);
  });

  it("caps the feed", () => {
    const many = Array.from({ length: 300 }, (_, i) => step(1, `s${i}`));
    expect(scheduleSteps(many, [1, 2, 3, 4, 5, 6, 7], now, "Europe/London")).toHaveLength(MAX_FEED_EVENTS);
  });
});

describe("buildFeed", () => {
  const items = [
    { date: "2026-10-12", item: { step: step(3, "plan_first_step", { indexInUnit: 0, countInUnit: 2 }), name: "Plan your first small step" } },
    { date: "2026-10-14", item: { step: step(3, "second", { indexInUnit: 1, countInUnit: 2 }), name: "Plan your first small step" } },
  ];
  const text = buildFeed({ feedId: "abc123", items, openUrl: "https://akana.example/today/go?e=11111111-1111-1111-1111-111111111111", now });
  const lines = text.split("\r\n");

  it("is a calendar of all-day events with CRLF line ends", () => {
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines.at(-2)).toBe("END:VCALENDAR");
    expect(lines.at(-1)).toBe("");
    expect(text).not.toMatch(/[^\r]\n/);
    expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(text).toContain("DTSTART;VALUE=DATE:20261012");
    expect(text).toContain("DTEND;VALUE=DATE:20261013");
    expect(text).toContain("DTSTART;VALUE=DATE:20261014");
    expect(text).toContain("TRANSP:TRANSPARENT");
    expect(text).toContain("METHOD:PUBLISH");
  });

  it("names the step by unit name with the Akana today prefix, and numbers a unit's steps", () => {
    expect(text).toContain("SUMMARY:Akana today: Plan your first small step (1 of 2)");
    expect(text).toContain("SUMMARY:Akana today: Plan your first small step (2 of 2)");
  });

  it("gives each event a stable id that holds no enrolment id or address", () => {
    const uids = lines.filter((l) => l.startsWith("UID:"));
    expect(uids).toEqual(["UID:abc123-3-plan_first_step@akana", "UID:abc123-3-second@akana"]);
    expect(new Set(uids).size).toBe(2);
    expect(buildFeed({ feedId: "abc123", items, openUrl: "x", now })).toBe(buildFeed({ feedId: "abc123", items, openUrl: "x", now }));
  });

  it("links to the step and carries nothing else: no answers, no field labels", () => {
    expect(text).toContain("URL:https://akana.example/today/go?e=");
    expect(text).not.toMatch(/What matters most|Exercise plan|answer/i);
  });

  it("keeps every line within 75 octets", () => {
    const long = buildFeed({ feedId: "f", items: [{ date: "2026-10-12", item: { step: step(1, "x"), name: "A very long unit name, with commas; and semicolons, that runs on and on and on and on and on" } }], openUrl: "https://akana.example/" + "p".repeat(120), now });
    for (const l of long.split("\r\n")) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    // Unfolded, the long name is intact and escaped.
    expect(long.replace(/\r\n /g, "")).toContain("A very long unit name\\, with commas\; and semicolons\\, that runs on");
  });

  it("is an empty calendar when there are no events", () => {
    expect(buildFeed({ feedId: "f", items: [], openUrl: "x", now })).not.toContain("BEGIN:VEVENT");
  });
});

describe("icsText", () => {
  it("escapes backslash, semicolon, comma and newline", () => {
    expect(icsText("a\\b;c,d\ne")).toBe("a\\\\b\;c\\,d\\ne");
  });
});
