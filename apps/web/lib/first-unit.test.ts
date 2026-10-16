import { describe, expect, it } from "vitest";
import focus from "../../../content/workbooks/v3/focus.json";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { firstUnitGap, firstUnitGaps, NO_UNIT_ROW_REASON, NO_VERSION_REASON } from "./first-unit";

/**
 * Policy 7.9: a title shows in the library only when its first unit is
 * complete. The unit 1 row is built here the way app.publish_version()
 * builds it (migration 0002): the unit object plus its exercises resolved in
 * exercise_ids order, with nothing else.
 */

type Obj = Record<string, unknown>;
const doc = focus as unknown as { units: Obj[]; exercises: Obj[] };

function unitRow(n = 1): Obj {
  const unit = doc.units.find((u) => u.number === n)!;
  const ids = unit.exercise_ids as string[];
  const exercises = ids.map((id) => doc.exercises.find((e) => e.id === id)!);
  return { ...unit, exercises };
}

describe("firstUnitGap", () => {
  it("accepts unit 1 of a validated v3 workbook as published", () => {
    expect(firstUnitGap(unitRow())).toEqual({ complete: true });
  });

  it("fails with a reason when there is no unit 1 row", () => {
    expect(firstUnitGap(undefined)).toEqual({ complete: false, reason: NO_UNIT_ROW_REASON });
  });

  it("fails when a required field of the unit or an exercise is missing", () => {
    const noFocus = { ...unitRow(), focus: undefined };
    expect(firstUnitGap(noFocus)).toMatchObject({ complete: false, reason: expect.stringContaining("focus") });

    const row = unitRow();
    const [first, ...rest] = row.exercises as Obj[];
    const broken = Object.fromEntries(Object.entries(first!).filter(([k]) => k !== "done_when"));
    expect(firstUnitGap({ ...row, exercises: [broken, ...rest] })).toMatchObject({ complete: false, reason: expect.stringContaining("done_when") });
  });

  it("fails when the unit names an exercise the version does not hold, or has no exercises at all", () => {
    const row = unitRow();
    expect(firstUnitGap({ ...row, exercise_ids: [...(row.exercise_ids as string[]), "missing_ex"] })).toMatchObject({
      complete: false,
      reason: expect.stringContaining("missing_ex"),
    });
    expect(firstUnitGap({ ...row, exercises: [] })).toMatchObject({ complete: false });
  });

  it("fails on an unknown key, a blank focus line or the wrong unit number", () => {
    expect(firstUnitGap({ ...unitRow(), extra: 1 })).toMatchObject({ complete: false });
    expect(firstUnitGap({ ...unitRow(), focus: "  " })).toEqual({ complete: false, reason: "Unit 1 has no focus line" });
    expect(firstUnitGap({ ...unitRow(), number: 2 })).toEqual({ complete: false, reason: "Unit 1 row carries number 2" });
  });

  it("is not fooled by a different unit's row", () => {
    expect(firstUnitGap(unitRow(2))).toMatchObject({ complete: false });
  });
});

describe("firstUnitGaps", () => {
  it("maps each workbook to its gap from its current version", () => {
    const gaps = firstUnitGaps(
      [
        { id: "a", current_version_id: "v-a" },
        { id: "b", current_version_id: null },
        { id: "c", current_version_id: "v-c" },
        { id: "d", current_version_id: "v-d" },
      ],
      [
        { version_id: "v-a", body: unitRow() },
        { version_id: "v-d", body: { number: 1 } },
      ],
    );
    expect(gaps.get("a")).toEqual({ complete: true });
    expect(gaps.get("b")).toEqual({ complete: false, reason: NO_VERSION_REASON });
    expect(gaps.get("c")).toEqual({ complete: false, reason: NO_UNIT_ROW_REASON });
    expect(gaps.get("d")).toMatchObject({ complete: false, reason: expect.stringContaining("Unit 1 is incomplete") });
  });

  it("lists a demo title with no version, marked as having no sample, and keeps a non-demo title with none hidden", () => {
    const rows = [
      { id: "demo", current_version_id: null, is_demo: true },
      { id: "real", current_version_id: null, is_demo: false },
      { id: "plain", current_version_id: null },
    ];
    const gaps = firstUnitGaps(rows, []);
    expect(gaps.get("demo")).toEqual({ complete: true, demoNoSample: true });
    expect(gaps.get("real")).toEqual({ complete: false, reason: NO_VERSION_REASON });
    expect(gaps.get("plain")).toEqual({ complete: false, reason: NO_VERSION_REASON });
    expect(rows.filter((r) => gaps.get(r.id)?.complete === true).map((r) => r.id)).toEqual(["demo"]); // what onlyComplete does
  });

  it("exempts a demo title with a missing or broken unit 1, and leaves a complete one unmarked", () => {
    const gaps = firstUnitGaps(
      [
        { id: "no-row", current_version_id: "v1", is_demo: true },
        { id: "broken", current_version_id: "v2", is_demo: true },
        { id: "good", current_version_id: "v3", is_demo: true },
        { id: "real-broken", current_version_id: "v2", is_demo: false },
      ],
      [
        { version_id: "v2", body: { number: 1 } },
        { version_id: "v3", body: unitRow() },
      ],
    );
    expect(gaps.get("no-row")).toEqual({ complete: true, demoNoSample: true });
    expect(gaps.get("broken")).toEqual({ complete: true, demoNoSample: true });
    expect(gaps.get("good")).toEqual({ complete: true });
    expect(gaps.get("real-broken")).toMatchObject({ complete: false });
  });
});

describe("the five classics", () => {
  const dir = join(__dirname, "../../../content/workbooks/classics");
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

  it("has five files", () => {
    expect(files).toHaveLength(5);
  });

  it.each(files)("%s has a complete unit 1, so it lists once published", (file) => {
    const doc = JSON.parse(readFileSync(join(dir, file), "utf8")) as { units: Obj[]; exercises: Obj[] };
    const unit = doc.units.find((u) => u.number === 1)!;
    const exercises = (unit.exercise_ids as string[]).map((id) => doc.exercises.find((e) => e.id === id)!);
    expect(firstUnitGap({ ...unit, exercises })).toEqual({ complete: true });
  });
});
