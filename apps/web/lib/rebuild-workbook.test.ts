import { describe, expect, it } from "vitest";
import { rebuildWorkbook, type SectionRow } from "./rebuild-workbook";

const listing = {
  schema_version: "3.0", code: "AK-TEST1", slug: "wb", title: "Workbook", card_line: "Card", genre: "business",
  language: "en", spelling: "en-GB", is_demo: false, depth: "full", badge: "official", safety_tier: "none",
  structure: { unit: "week", count: 3, free_units: 1 },
  outline: [{ number: 1, focus: "One" }, { number: 2, focus: "Two" }, { number: 3, focus: "Three" }],
};
const start = { start: { welcome: "Hi", how_it_works: ["a", "b"], why_prompt: "Why" }, plan_sections: [], milestones: [] };
const ex = (id: string) => ({ id, title: id, purpose: "p", why: "w", source: { chapter: "1" }, minutes: 5, steps: [{ text: "Do" }], fields: [{ id: "f", type: "short_text", label: "L" }], done_when: "Done" });

const toolkitCard = { id: "tk", title: "Card", when_to_use: "w", steps: ["a", "b"], minutes: 3, source: { chapter: "1" } };

const rows: SectionRow[] = [
  { kind: "listing", unit_number: null, body: listing, free: true },
  { kind: "start", unit_number: null, body: start, free: true },
  { kind: "unit", unit_number: 1, body: { number: 1, focus: "One", exercise_ids: ["ex_one"], exercises: [ex("ex_one")] }, free: true },
  { kind: "safety_hub", unit_number: null, body: { points: [{ title: "Help", text: "Reach out" }], see_doctor: ["If worried"] }, free: true },
];

describe("rebuildWorkbook", () => {
  it("rebuilds the free view and marks paid units locked (no toolkit row returned)", () => {
    const out = rebuildWorkbook(rows);
    expect(out).not.toBeNull();
    const { workbook, lockedUnits, missing } = out!;
    expect(workbook.title).toBe("Workbook");
    expect(workbook.units.map((u) => u.number)).toEqual([1, 2, 3]);
    expect(workbook.units[1]!.exercise_ids).toEqual([]);
    expect(workbook.exercises.map((e) => e.id)).toEqual(["ex_one"]);
    expect(workbook.toolkit).toEqual([]);
    expect(workbook.safety_hub?.points).toHaveLength(1);
    expect(lockedUnits).toEqual([2, 3]);
    expect(missing).toEqual(["toolkit", "finish", "keep_going"]);
    expect("outline" in workbook).toBe(false);
  });

  it("rebuilds the full view with exercises deduplicated across units", () => {
    const full: SectionRow[] = [
      ...rows,
      { kind: "unit", unit_number: 2, body: { number: 2, focus: "Two", exercise_ids: ["ex_three", "ex_two"], exercises: [ex("ex_three"), ex("ex_two")] }, free: false },
      { kind: "unit", unit_number: 3, body: { number: 3, focus: "Three", exercise_ids: ["ex_three"], exercises: [ex("ex_three")] }, free: false },
      { kind: "toolkit", unit_number: null, body: { cards: [toolkitCard] }, free: true },
      { kind: "finish", unit_number: null, body: { summary: "Done", book_bridge: "Back" }, free: false },
      { kind: "keep_going", unit_number: null, body: { monthly_questions: ["Still?"], refresher_ids: ["ex_one"] }, free: false },
    ];
    const out = rebuildWorkbook(full)!;
    expect(out.lockedUnits).toEqual([]);
    expect(out.missing).toEqual([]);
    expect(out.workbook.exercises.map((e) => e.id).sort()).toEqual(["ex_one", "ex_three", "ex_two"]);
    expect(out.workbook.toolkit).toHaveLength(1);
    expect(out.workbook.finish.summary).toBe("Done");
    expect(out.workbook.keep_going?.monthly_questions).toEqual(["Still?"]);
  });

  it("loads the toolkit before purchase now that it is free (0008)", () => {
    const freeView: SectionRow[] = [...rows, { kind: "toolkit", unit_number: null, body: { cards: [toolkitCard] }, free: true }];
    const out = rebuildWorkbook(freeView)!;
    expect(out.workbook.toolkit).toHaveLength(1);
    expect(out.lockedUnits).toEqual([2, 3]);
    expect(out.missing).toEqual(["finish", "keep_going"]);
  });

  it("returns null without a listing and start", () => {
    expect(rebuildWorkbook(rows.slice(2))).toBeNull();
  });
});
