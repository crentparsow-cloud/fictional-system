import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { WorkbookV3, stripInternal } from "@akana/schema";
import { renderAll } from "../harness";

const dir = resolve(__dirname, "../../../../content/workbooks/v3");

function loadAll() {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  return files.map((f) => WorkbookV3.parse(stripInternal(JSON.parse(readFileSync(join(dir, f), "utf8")))));
}

describe("parity harness", () => {
  it("renders every screen of all 20 v3 workbooks with no failures", () => {
    const docs = loadAll();
    expect(docs).toHaveLength(20);
    const r = renderAll(docs);
    if (r.failures.length) console.error(r.failures);
    expect(r.failures).toEqual([]);
    // Start, 12 units in two modes, every exercise in both modes, toolkit, daily, two check-ins, self-check, finish, keep going.
    expect(r.rendered).toBeGreaterThan(20 * (1 + 24 + 22 + 1 + 1 + 2 + 1 + 1 + 1));
    // The Maya Vaughn set uses v1 field types only, so nothing is pending.
    expect(r.pending).toBe(0);
  });

  it("counts week 3 placeholders as pending, not failures, and names unknown types", () => {
    const base = loadAll()[0];
    if (!base) throw new Error("no workbooks");
    const first = base.exercises[0];
    if (!first) throw new Error("no exercises");
    const patched: WorkbookV3 = {
      ...base,
      exercises: [
        { ...first, fields: [...first.fields, { id: "f_num", type: "number", label: "A count", min: 0, max: 10 }] },
        ...base.exercises.slice(1),
      ],
    };
    const r = renderAll([patched]);
    expect(r.failures).toEqual([]);
    // Full and short unit renders plus the exercise alone in full: the short version does not include f_num.
    expect(r.pending).toBeGreaterThanOrEqual(2);

    const broken = {
      ...base,
      exercises: [{ ...first, fields: [{ id: "f_bad", type: "hologram", label: "Bad" }] }, ...base.exercises.slice(1)],
    } as unknown as WorkbookV3;
    const spy = console.error;
    console.error = () => undefined;
    const b = renderAll([broken]);
    console.error = spy;
    expect(b.failures.length).toBeGreaterThan(0);
    expect(b.failures[0]?.field).toBe("f_bad");
    expect(b.failures[0]?.error).toContain("hologram");
  });
});
