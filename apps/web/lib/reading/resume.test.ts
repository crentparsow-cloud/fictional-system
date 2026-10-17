import { describe, expect, it } from "vitest";
import { LEAVE_LINE, resumeHref, resumeWhere } from "./resume";
import { openAtFromQuery } from "@/lib/today/links";

const row = { unit: 3, exercise_id: "ex-3-1", page: "yours", field_id: "f2", mode: null };

describe("resume link", () => {
  it("names the unit, step, page and field", () => {
    expect(resumeHref("calm-nights", row)).toBe("/read/calm-nights?unit=3&step=ex-3-1&page=yours&field=f2");
  });
  it("carries the short version", () => {
    expect(resumeHref("a", { ...row, mode: "short" })).toContain("short=1");
  });
  it("opens just the unit when no exercise was open", () => {
    expect(resumeHref("a", { unit: 2, exercise_id: null, page: "yours", field_id: "f", mode: null })).toBe("/read/a?unit=2");
  });
  it("round-trips through the read page's own parser", () => {
    const href = resumeHref("a", row);
    const sp = Object.fromEntries(new URL(href, "https://x.test").searchParams);
    expect(openAtFromQuery(sp)).toMatchObject({ unit: 3, exerciseId: "ex-3-1", page: "yours", fieldId: "f2" });
  });
  it("says where without dates or counts", () => {
    expect(resumeWhere("week", row)).toBe("Week 3, where you left off");
    expect(resumeWhere("day", { ...row, exercise_id: null })).toBe("Day 3");
  });
  it("has the one reassurance line", () => {
    expect(LEAVE_LINE).toBe("You can leave any time. Your answers are kept.");
  });
});
