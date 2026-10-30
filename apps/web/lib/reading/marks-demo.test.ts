import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MARK_REF, paragraphRef, screenRef } from "@/lib/reading/marks";

/**
 * Highlights on a demo workbook (signed-in test, 30 October 2026): a demo is
 * written in parts, its key ideas carry no example and it has no source. Each
 * screen of a part must still give refs the marks route and the
 * reader_marks check accept.
 */
const demo = JSON.parse(readFileSync(resolve(__dirname, "../../../../content/workbooks/demo/a-polite-no-dj4fc.json"), "utf8")) as {
  structure: { unit: string };
  source?: unknown;
  units: { number: number; exercise_ids: string[]; ideas?: { example?: string }[] }[];
};

describe("marks on a demo part", () => {
  it("is the shape the bug was found on", () => {
    expect(demo.structure.unit).toBe("part");
    expect(demo.source).toBeUndefined();
    expect(demo.units[0]!.ideas?.every((i) => i.example === undefined)).toBe(true);
  });

  it("gives a valid ref for every paragraph on every part screen and exercise page", () => {
    for (const u of demo.units) {
      const list = screenRef({ screen: "ak-unit", unit: String(u.number), exercise: null, page: null });
      expect(MARK_REF.test(paragraphRef(list, 0))).toBe(true);
      for (const id of u.exercise_ids) {
        for (const page of ["purpose", "steps", "yours", "done"]) {
          const s = screenRef({ screen: "ak-exercise", unit: null, exercise: id, page });
          for (const i of [0, 5, 40]) expect(MARK_REF.test(paragraphRef(s, i)), `${s}#${i}`).toBe(true);
        }
      }
    }
  });
});
