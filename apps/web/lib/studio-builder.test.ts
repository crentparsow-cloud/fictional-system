import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyBuilderModel, blankExercise, blankUnit, checkBuilderModel, modelFromContent, parseBuilderModel } from "./studio-builder";

function load(): Record<string, unknown> {
  const p = path.resolve(__dirname, "../../../content/workbooks/v3/focus.json");
  return JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
}

describe("studio builder", () => {
  it("round-trips a real workbook without change", () => {
    const base = load();
    const model = modelFromContent(base);
    expect(model.units.length).toBeGreaterThan(0);
    const next = applyBuilderModel(base, model);
    expect(next).toEqual(base);
    expect(checkBuilderModel(model, base)).toEqual([]);
  });

  it("adds a unit and keeps the structure count in step", () => {
    const base = load();
    const model = modelFromContent(base);
    const unit = blankUnit();
    unit.focus = "A new focus";
    const ex = blankExercise();
    unit.exercises = [ex];
    const next = applyBuilderModel(base, { ...model, units: [...model.units, unit] });
    const structure = next.structure as { count: number };
    expect(structure.count).toBe(model.units.length + 1);
  });

  it("refuses a model that drops an existing unit", () => {
    const base = load();
    const model = modelFromContent(base);
    const issues = checkBuilderModel({ ...model, units: model.units.slice(1) }, base);
    expect(issues.length).toBeGreaterThan(0);
  });

  it("rejects bad model text", () => {
    expect(parseBuilderModel("not json").ok).toBe(false);
  });
});
