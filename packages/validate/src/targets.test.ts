import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { contentTargets, validateTargets } from "./targets";

const REPO = join(import.meta.dirname, "..", "..", "..");

function fakeRoot(layout: Record<string, string[]>): string {
  const root = mkdtempSync(join(tmpdir(), "akana-targets-"));
  for (const [dir, files] of Object.entries(layout)) {
    mkdirSync(join(root, "content", "workbooks", dir), { recursive: true });
    for (const f of files) writeFileSync(join(root, "content", "workbooks", dir, f), "{}");
  }
  return root;
}

describe("contentTargets (10.10)", () => {
  it("scans v3 first and then classics, sorted, JSON only", () => {
    const root = fakeRoot({ v3: ["b.json", "a.json", "notes.md"], classics: ["z.json"] });
    expect(contentTargets(root).map((f) => relative(root, f))).toEqual([
      "content/workbooks/v3/a.json",
      "content/workbooks/v3/b.json",
      "content/workbooks/classics/z.json",
    ]);
  });

  it("still scans v3 when there is no classics folder, and returns nothing when neither exists", () => {
    expect(contentTargets(fakeRoot({ v3: ["a.json"] }))).toHaveLength(1);
    expect(contentTargets(fakeRoot({}))).toEqual([]);
  });

  it("covers the real repository: the 20 Maya Vaughn files and every classic", () => {
    const files = contentTargets(REPO).map((f) => relative(REPO, f));
    expect(files.filter((f) => f.startsWith("content/workbooks/v3/"))).toHaveLength(20);
    expect(files).toContain("content/workbooks/classics/meditations.json");
  });
});

describe("validateTargets", () => {
  it("passes the real classics", () => {
    const classics = contentTargets(REPO).filter((f) => f.includes("/classics/"));
    for (const r of validateTargets(classics)) expect(r.blocking.map((b) => b.message), r.file).toEqual([]);
  });

  it("fails a file that is not a workbook, and one that is not JSON", () => {
    const root = fakeRoot({ classics: ["empty.json"] });
    writeFileSync(join(root, "content", "workbooks", "classics", "broken.json"), "{not json");
    const results = validateTargets(contentTargets(root));
    expect(results).toHaveLength(2);
    expect(results.every((r) => !r.ok)).toBe(true);
    expect(results.find((r) => r.file.endsWith("broken.json"))?.blocking[0]?.message).toMatch(/not valid JSON/);
  });
});
