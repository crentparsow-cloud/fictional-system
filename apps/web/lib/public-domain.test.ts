import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import demoCatalogue from "../../../docs/planning/AK_Demo_Catalogue.json";
import { getPublicDomainRecord, LAUNCH_MARKETS, listPublicDomainRecords } from "@/lib/public-domain";

type DemoWorkbook = { id: string; code: string; url_slug: string; title: string; author: string; is_demo: boolean; public_domain?: { people: { name: string; died: number; role: string }[] } };
const workbooks = (demoCatalogue as unknown as { workbooks: DemoWorkbook[] }).workbooks;
// The seed badges a workbook public_domain when it is not demo and carries a public_domain block (packages/seed/src/build.ts).
const classics = workbooks.filter((w) => !w.is_demo && w.public_domain);

const repoRoot = path.resolve(__dirname, "..", "..", "..");

describe("public-domain file (F-118)", () => {
  it("finds the five classics in the demo catalogue", () => {
    expect(classics).toHaveLength(5);
  });

  it.each(classics.map((w) => [w.code, w] as const))("%s has a record that matches the catalogue", (code, w) => {
    const r = getPublicDomainRecord(code);
    expect(r).not.toBeNull();
    expect(r!.title).toBe(w.title);
    expect(r!.author).toBe(w.author);
    expect(r!.slug).toBe(w.url_slug);
    // Death years come only from the repo: every catalogue contributor appears with the same year.
    for (const p of w.public_domain!.people) {
      expect(r!.people).toContainEqual(expect.objectContaining({ name: p.name, role: p.role, died: p.died }));
    }
  });

  it.each(listPublicDomainRecords().map((r) => [r.code, r] as const))("%s concludes on all six launch markets", (_code, r) => {
    expect(r.markets.map((m) => m.market).sort()).toEqual([...LAUNCH_MARKETS].sort());
    for (const m of r.markets) {
      expect(["clear", "to_confirm"]).toContain(m.conclusion);
      expect(m.rule.length).toBeGreaterThan(0);
      expect(m.basis.length).toBeGreaterThan(0);
    }
  });

  it("is unreviewed until someone signs, and every record lists open checks", () => {
    for (const r of listPublicDomainRecords()) {
      if (r.status !== "reviewed") expect(r.reviewedBy).toBeNull();
      expect(r.checks.length).toBeGreaterThan(0);
    }
  });

  it("has a Markdown twin with a review line for every JSON record, and no stray files", () => {
    const jsonCodes = readdirSync(path.join(repoRoot, "content", "public-domain")).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")).sort();
    expect(jsonCodes).toEqual(listPublicDomainRecords().map((r) => r.code).sort());
    for (const code of jsonCodes) {
      const md = readFileSync(path.join(repoRoot, "docs", "public-domain", `${code}.md`), "utf8");
      expect(md).toContain("Reviewed by: ______");
      for (const m of LAUNCH_MARKETS) expect(md).toMatch(new RegExp(`\\| ${m} \\|`));
    }
  });

  it("looks codes up case-insensitively and returns null for unknown codes", () => {
    expect(getPublicDomainRecord("ak-fn9kb")?.title).toBe("Meditations");
    expect(getPublicDomainRecord("AK-TJWHK")).toBeNull();
  });
});
