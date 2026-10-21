import { describe, expect, it } from "vitest";
import type { LibraryCard } from "@/lib/catalogue-types";
import { step } from "@/lib/today/fixtures";
import { easyStep, openAtFromQuery, resumeHref, stepHref } from "@/lib/today/links";
import { addActive, BREAK_AFTER_MINUTES, shouldSuggestBreak } from "@/lib/today/pause";
import { parseSettingsForm, remindersReallyOn } from "@/lib/today/settings";
import { buildSuggestions } from "@/lib/today/suggest";

describe("pause and the break line (14.5)", () => {
  it("suggests a break after 45 minutes of active time, once", () => {
    expect(BREAK_AFTER_MINUTES).toBe(45);
    expect(shouldSuggestBreak(44 * 60_000, false)).toBe(false);
    expect(shouldSuggestBreak(45 * 60_000, false)).toBe(true);
    expect(shouldSuggestBreak(90 * 60_000, true)).toBe(false);
  });
  it("counts time only while the page is visible, and not a sleeping laptop", () => {
    expect(addActive(0, 0, 5_000, true)).toBe(5_000);
    expect(addActive(5_000, 5_000, 10_000, false)).toBe(5_000);
    expect(addActive(5_000, 10_000, 10_000 + 3_600_000, true)).toBe(5_000);
  });
});

describe("links (12.10)", () => {
  it("builds the step link and the resume link", () => {
    expect(stepHref("my-book", step(3, "plan_first_step"))).toBe("/read/my-book?unit=3&step=plan_first_step");
    expect(stepHref("my-book", step(3, "plan"), { short: true })).toBe("/read/my-book?unit=3&step=plan&short=1");
    expect(resumeHref("my-book")).toBe("/read/my-book?resume=1");
  });
  it("reads a place from the query and drops anything odd", () => {
    expect(openAtFromQuery({ unit: "3", step: "plan", short: "1", page: "yours", field: "what" })).toEqual({
      unit: 3,
      exerciseId: "plan",
      mode: "short",
      page: "yours",
      fieldId: "what",
    });
    expect(openAtFromQuery({ unit: "3" })).toEqual({ unit: 3, exerciseId: null, mode: null, page: null, fieldId: null });
    expect(openAtFromQuery({ unit: "0" })).toBeNull();
    expect(openAtFromQuery({ unit: "x" })).toBeNull();
    expect(openAtFromQuery({})).toBeNull();
    const odd = openAtFromQuery({ unit: "2", step: "<script>", page: "evil", field: "A B" });
    expect(odd).toEqual({ unit: 2, exerciseId: null, mode: null, page: null, fieldId: null });
  });
  it("picks the short version for the easy step when there is one", () => {
    expect(easyStep(step(1, "a", { minutes: 12, short: { minutes: 3, fieldIds: ["what"] } }))).toEqual({ minutes: 3, short: true });
    expect(easyStep(step(1, "a", { minutes: 12 }))).toEqual({ minutes: 12, short: false });
  });
});

describe("settings form", () => {
  const form = (entries: [string, string][]) => ({
    get: (n: string) => entries.find(([k]) => k === n)?.[1] ?? null,
    getAll: (n: string) => entries.filter(([k]) => k === n).map(([, v]) => v),
  });
  const base: [string, string][] = [
    ["enrolment", "11111111-1111-4111-8111-111111111111"],
    ["time", "08:30"],
    ["timezone", "Europe/London"],
    ["review", "sometimes"],
  ];
  it("reads days, time, zone and dial", () => {
    const f = parseSettingsForm(form([...base, ["reminders", "on"], ["day", "5"], ["day", "1"], ["day", "1"], ["pickup", "on"]]));
    expect(f).toMatchObject({ remindersOn: true, days: [1, 5], time: "08:30", timeZone: "Europe/London", review: "sometimes", pickup: true });
  });
  it("refuses a bad day, time, zone or dial", () => {
    expect(parseSettingsForm(form([...base, ["day", "8"]]))).toBeNull();
    expect(parseSettingsForm(form([["enrolment", "x"]]))).toBeNull();
    expect(parseSettingsForm(form(base.map(([k, v]) => (k === "time" ? [k, "25:00"] : [k, v]) as [string, string])))).toBeNull();
    expect(parseSettingsForm(form(base.map(([k, v]) => (k === "timezone" ? [k, "Mars/Olympus"] : [k, v]) as [string, string])))).toBeNull();
    expect(parseSettingsForm(form(base.map(([k, v]) => (k === "review" ? [k, "daily"] : [k, v]) as [string, string])))).toBeNull();
  });
  it("keeps reminders off until a day is chosen", () => {
    expect(remindersReallyOn({ remindersOn: true, days: [] })).toBe(false);
    expect(remindersReallyOn({ remindersOn: true, days: [2] })).toBe(true);
    expect(remindersReallyOn({ remindersOn: false, days: [2] })).toBe(false);
  });
  it("leaves reminders off when the box is not ticked", () => {
    expect(parseSettingsForm(form([...base, ["day", "2"]]))?.remindersOn).toBe(false);
  });
});

describe("suggestions", () => {
  const card = (id: string, over: Partial<LibraryCard> = {}): LibraryCard => ({
    id,
    code: `AK-${id}`,
    slug: `slug-${id}`,
    title: `Title ${id}`,
    shortTitle: null,
    cardLine: `Line ${id}`,
    genreId: "productivity",
    genreName: "Productivity",
    themeId: "focus",
    themeName: "Focus",
    badge: "official",
    isDemo: false,
    depth: "full",
    safetyTier: "none",
    authors: [],
    hasVersion: true,
    unitCount: 8,
    ...over,
  });
  const none = new Set<string>();
  const input = (cards: LibraryCard[], over: Partial<Parameters<typeof buildSuggestions>[0]> = {}) => ({
    cards,
    enrolledWorkbookIds: none,
    enrolledThemeIds: none,
    enrolledGenreIds: none,
    outsideMembership: none,
    ...over,
  });

  it("finds a related title in the same Theme, never one already open or a demo", () => {
    const out = buildSuggestions(
      input([card("a"), card("b", { isDemo: true }), card("c", { themeId: "money" }), card("d")], { enrolledWorkbookIds: new Set(["a"]), enrolledThemeIds: new Set(["focus"]) }),
    );
    expect(out.find((s) => s.kind === "related")?.slug).toBe("slug-d");
  });

  it("keeps wellbeing titles out of next programme and start here, but allows one in a Theme they already have", () => {
    const cards = [card("w", { safetyTier: "standard", themeId: "mood" }), card("p", { themeId: "money", unitCount: 12 })];
    const cold = buildSuggestions(input(cards));
    expect(cold.map((s) => s.slug)).toEqual(["slug-p", "slug-p"]);
    const warm = buildSuggestions(input(cards, { enrolledThemeIds: new Set(["mood"]) }));
    expect(warm.find((s) => s.kind === "related")?.slug).toBe("slug-w");
  });

  it("leaves titles the membership does not cover out of next programme, and prefers the same genre and the shorter one", () => {
    const cards = [card("a", { themeId: "x", genreId: "money", unitCount: 4 }), card("b", { themeId: "x", genreId: "productivity", unitCount: 4 }), card("c", { themeId: "x", genreId: "productivity", unitCount: 6 })];
    const out = buildSuggestions(input(cards, { enrolledGenreIds: new Set(["productivity"]), outsideMembership: new Set(["b"]) }));
    expect(out.find((s) => s.kind === "next_programme")?.slug).toBe("slug-c");
    expect(out.find((s) => s.kind === "start_here")?.slug).toBe("slug-a");
  });

  it("offers nothing when the library has nothing the reader has not opened", () => {
    expect(buildSuggestions(input([card("a")], { enrolledWorkbookIds: new Set(["a"]) }))).toEqual([]);
  });

  it("uses the short title when there is one, and the card line", () => {
    const out = buildSuggestions(input([card("a", { shortTitle: "Short" })]));
    expect(out[0]).toMatchObject({ title: "Short", line: "Line a" });
  });
});
