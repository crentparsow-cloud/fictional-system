import { describe, expect, it } from "vitest";
import focus from "../../../content/workbooks/v3/focus.json";
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
});
