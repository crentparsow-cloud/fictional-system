import { readFileSync } from "node:fs";
import { WorkbookV3 } from "@akana/schema";
import { describe, expect, it } from "vitest";
import { attachDemo, buildSeed, demoFiles, ids, repoRoot } from "./build";
import type { WorkbookRow } from "./rows";

const root = repoRoot();
const files = demoFiles(root);
const sampleFile = files.find((f) => f.endsWith("a-polite-no-dj4fc.json"))!;
const sample = WorkbookV3.parse(JSON.parse(readFileSync(sampleFile, "utf8")));

/** A seed built without demo files, so attachDemo can be called on fresh rows. */
function bare() {
  const s = buildSeed({ demos: false });
  const catalogue = JSON.parse(readFileSync(`${root}/docs/planning/AK_Demo_Catalogue_v2.json`, "utf8")) as { workbooks: { code: string; author_id: string; is_demo: boolean }[] };
  const catalogueAuthor = new Map(catalogue.workbooks.filter((w) => w.is_demo).map((w) => [w.code, w.author_id]));
  return { ...s, catalogueAuthor };
}
const rowOf = (ws: WorkbookRow[], code: string) => ws.find((w) => w.code === code)!;

describe("demo workbooks in the seed", () => {
  it("finds the sample in content/workbooks/demo", () => {
    expect(files.length).toBeGreaterThanOrEqual(1);
    expect(sampleFile).toBeTruthy();
  });

  it("attaches each demo file to its catalogue row, keeps the badge and the draft status", () => {
    const seed = buildSeed();
    for (const f of files) {
      const doc = WorkbookV3.parse(JSON.parse(readFileSync(f, "utf8")));
      const row = rowOf(seed.workbooks, doc.code);
      const v = seed.workbook_versions.find((x) => x.workbook_id === row.id)!;
      expect(v.id).toBe(ids.version(doc.code, "1.0.0"));
      expect(row.current_version_id).toBe(v.id);
      expect(row.badge).toBe("demo");
      expect(row.is_demo).toBe(true);
      expect(row.status).toBe("draft");
      expect(row.depth).toBe("full");
      expect(row.licence_ref).toBeNull();
      expect(row.card_line).toBe(doc.card_line);
      expect((v.content as { is_demo: boolean }).is_demo).toBe(true);
      expect(v.content).not.toHaveProperty("internal");
    }
  });

  it("never changes the row's status, whatever it is", () => {
    for (const status of ["draft", "live", "paused"] as const) {
      const s = bare();
      rowOf(s.workbooks, sample.code).status = status;
      attachDemo({ file: sampleFile, doc: sample, workbooks: s.workbooks, workbook_versions: s.workbook_versions, books: s.books, catalogueAuthor: s.catalogueAuthor });
      expect(rowOf(s.workbooks, sample.code).status).toBe(status);
      expect(rowOf(s.workbooks, sample.code).badge).toBe("demo");
    }
  });

  it("refuses a file that disagrees with the catalogue", () => {
    const attach = (doc: typeof sample) => {
      const s = bare();
      return () => attachDemo({ file: "x.json", doc, workbooks: s.workbooks, workbook_versions: s.workbook_versions, books: s.books, catalogueAuthor: s.catalogueAuthor });
    };
    expect(attach({ ...sample, code: "AK-00000" })).toThrow(/not in the catalogue/);
    expect(attach({ ...sample, slug: "a-polite-no" })).toThrow(/slug/);
    expect(attach({ ...sample, status: "live" })).toThrow(/carries status/);
    expect(attach({ ...sample, badge: "official" })).toThrow(/file badge/);
    expect(attach({ ...sample, safety_tier: "standard" })).toThrow(/safety tier/);
    expect(attach({ ...sample, author: { author_id: "AU-BXMPD", display_name: "Benjamin Franklin" } })).toThrow(/author/);
    // A classic's code: the row is not a demo row.
    expect(attach({ ...sample, code: "AK-3TQX1" })).toThrow(/not a demo title/);
  });

  it("refuses a second version for the same code", () => {
    const s = bare();
    const go = () => attachDemo({ file: sampleFile, doc: sample, workbooks: s.workbooks, workbook_versions: s.workbook_versions, books: s.books, catalogueAuthor: s.catalogueAuthor });
    go();
    expect(go).toThrow(/a version already exists/);
  });

  it("leaves demo files out of a v1 build, which has no demo rows for them", () => {
    const v1 = buildSeed({ catalogue: "v1" });
    expect(v1.workbook_versions.some((v) => (v.content as { is_demo?: boolean }).is_demo)).toBe(false);
  });
});
