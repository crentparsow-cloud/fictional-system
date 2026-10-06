import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WorkbookV3 } from "@akana/schema";
import { checkIdStability } from "./index";

// One real v3 file (a higher tier title, so it carries both safety notes).
const FILE = join(import.meta.dirname, "..", "..", "..", "content", "workbooks", "v3", "grief.json");
const base = WorkbookV3.parse(JSON.parse(readFileSync(FILE, "utf8")));
const copy = (): WorkbookV3 => structuredClone(base);
const codes = (prev: WorkbookV3, next: WorkbookV3) => checkIdStability(prev, next).map((f) => f.code);

describe("checkIdStability", () => {
  it("finds nothing when the workbook is unchanged", () => {
    expect(checkIdStability(base, copy())).toEqual([]);
  });

  it("allows additions and copy edits", () => {
    const next = copy();
    next.exercises[0]!.title = "A new title";
    next.exercises[0]!.fields.push({ id: "extra_note", type: "short_text", label: "Anything else?" });
    next.milestones.push({ id: "m99", trigger: "exercises_done:5", message: "Five done." });
    expect(checkIdStability(base, next)).toEqual([]);
  });

  it("flags a removed exercise", () => {
    const next = copy();
    const gone = next.exercises.pop()!;
    const f = checkIdStability(base, next);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ code: "EXERCISE_REMOVED", path: `exercises[${gone.id}]` });
  });

  it("flags a removed field and a field type change", () => {
    const next = copy();
    const ex = next.exercises[1]!;
    const removed = ex.fields[0]!;
    ex.fields = ex.fields.slice(1);
    if (ex.fields.length === 0) ex.fields.push({ id: "placeholder", type: "short_text", label: "x" });
    const f = checkIdStability(base, next);
    expect(f.map((x) => x.code)).toEqual(["FIELD_REMOVED"]);
    expect(f[0]!.path).toBe(`exercises[${ex.id}].fields[${removed.id}]`);

    const retyped = copy();
    const field = retyped.exercises[2]!.fields[0]!;
    field.type = field.type === "long_text" ? "short_text" : "long_text";
    expect(codes(base, retyped)).toEqual(["FIELD_TYPE_CHANGED"]);
  });

  it("flags removed units, toolkit cards, milestones and check-in fields", () => {
    const next = copy();
    next.units.pop();
    next.toolkit.pop();
    next.milestones.pop();
    next.checkin!.fields.pop();
    expect(codes(base, next).sort()).toEqual(["CHECKIN_FIELD_REMOVED", "MILESTONE_REMOVED", "TOOLKIT_REMOVED", "UNIT_REMOVED"]);
  });

  it("flags an id reused for a different kind of thing", () => {
    const next = copy();
    const exId = next.exercises[0]!.id;
    next.toolkit[0]!.id = exId;
    const f = checkIdStability(base, next);
    expect(f.map((x) => x.code)).toContain("ID_REUSED");
    expect(f.find((x) => x.code === "ID_REUSED")!.message).toContain("now names a toolkit");
  });

  it("flags a changed workbook code", () => {
    const next = copy();
    next.code = next.code === "AK-00000" ? "AK-11111" : "AK-00000";
    expect(codes(base, next)).toEqual(["CODE_CHANGED"]);
  });

  it("flags every safety line change and says sign-off must be redone", () => {
    const edits: [string, (d: WorkbookV3) => void][] = [
      ["start.higher_tier_note", (d) => void (d.start.higher_tier_note = d.start.higher_tier_note + " Changed.")],
      ["start.extra_safety_note", (d) => void (d.start.extra_safety_note = undefined)],
      ["safety_hub", (d) => void (d.safety_hub = { points: [{ title: "New", text: "New text." }], see_doctor: ["If it gets worse."] })],
      ["safety_tier", (d) => void (d.safety_tier = "standard")],
      ["advice_guardrail", (d) => void (d.advice_guardrail = "not_medical_advice")],
    ];
    for (const [path, edit] of edits) {
      const next = copy();
      edit(next);
      const f = checkIdStability(base, next);
      expect(f).toHaveLength(1);
      expect(f[0]).toMatchObject({ code: "SAFETY_CHANGED", path });
      expect(f[0]!.message).toContain("safety sign-off must be redone");
    }
  });
});
