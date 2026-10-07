import { describe, expect, it } from "vitest";
import { buildSeed } from "./build";
import { canonicalJson, contentHash, stableUuid } from "./ids";
import { renderSeedSql } from "./sql";
import { chunk } from "./apply";
import { AKANA_HOUSE_ORG_ID, MARKETPLACE_TENANT_ID, MAYA_VAUGHN_AUTHOR_CODE } from "./rows";

const seed = buildSeed();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("buildSeed", () => {
  it("returns 20 Maya Vaughn workbooks with versions and 50 catalogue workbooks without", () => {
    const maya = seed.workbooks.filter((w) => w.org_id === AKANA_HOUSE_ORG_ID && w.badge === "official");
    expect(maya).toHaveLength(20);
    const versionsByWorkbook = new Set(seed.workbook_versions.map((v) => v.workbook_id));
    for (const w of maya) {
      expect(w.current_version_id).not.toBeNull();
      expect(versionsByWorkbook.has(w.id)).toBe(true);
      expect(w.status).toBe("in_review");
      expect(w.depth).toBe("full");
      expect(w.is_demo).toBe(false);
    }
    expect(seed.workbook_versions).toHaveLength(20);

    const catalogue = seed.workbooks.filter((w) => !maya.includes(w));
    expect(catalogue).toHaveLength(50);
    for (const w of catalogue) {
      expect(w.current_version_id).toBeNull();
      expect(versionsByWorkbook.has(w.id)).toBe(false);
      expect(w.status).toBe("draft");
    }
    expect(seed.workbooks).toHaveLength(70);
    expect(seed.tenant_listings).toHaveLength(70);
    expect(seed.tenant_listings.every((l) => l.tenant_id === MARKETPLACE_TENANT_ID)).toBe(true);
  });

  it("gives ids that are stable across two runs", () => {
    const again = buildSeed();
    const idsOf = (s: typeof seed) =>
      Object.fromEntries(
        Object.entries(s).map(([table, rows]) => [table, (rows as Record<string, unknown>[]).map((r) => JSON.stringify(Object.values(r).slice(0, 2)))]),
      );
    expect(idsOf(again)).toEqual(idsOf(seed));
    expect(again.workbook_versions.map((v) => v.content_hash)).toEqual(seed.workbook_versions.map((v) => v.content_hash));
    expect(renderSeedSql(again)).toBe(renderSeedSql(seed));
  });

  it("marks every demo row is_demo true and never badges a demo workbook official", () => {
    const demoAuthorCodes = new Set(seed.authors.filter((a) => a.is_demo).map((a) => a.code));
    expect(demoAuthorCodes.size).toBe(18);
    for (const a of seed.authors) {
      if (demoAuthorCodes.has(a.code)) expect(a.is_demo).toBe(true);
    }
    const demoOrgs = seed.organisations.filter((o) => o.is_demo);
    expect(demoOrgs).toHaveLength(seed.organisations.length); // every seeded organisation is a demo one
    expect(demoOrgs.filter((o) => o.kind === "publisher")).toHaveLength(5);
    expect(demoOrgs.filter((o) => o.kind === "individual")).toHaveLength(7);

    const demoWorkbooks = seed.workbooks.filter((w) => w.is_demo);
    expect(demoWorkbooks).toHaveLength(45);
    for (const w of demoWorkbooks) {
      expect(w.badge).toBe("demo");
      expect(w.badge).not.toBe("official");
      const book = seed.books.find((b) => b.id === w.book_id);
      expect(book?.is_demo).toBe(true);
    }
    // The five classics are real public-domain texts, not demo content.
    const classics = seed.workbooks.filter((w) => w.badge === "public_domain");
    expect(classics).toHaveLength(5);
    for (const w of classics) {
      expect(w.is_demo).toBe(false);
      expect(w.org_id).toBe(AKANA_HOUSE_ORG_ID);
    }
  });

  it("only uses theme ids that exist in the registry", () => {
    const themeIds = new Set(seed.themes.map((t) => t.id));
    // 17 launch Themes plus the 34 from the expanded taxonomy (F-148).
    expect(themeIds.size).toBe(51);
    for (const w of seed.workbooks) {
      if (w.theme_id !== null) expect(themeIds.has(w.theme_id)).toBe(true);
    }
    // The catalogue uses exactly the 17 launch Themes; the 34 new ones hold
    // no title yet, and every one of them is held back from readers.
    const used = new Set(seed.workbooks.map((w) => w.theme_id).filter(Boolean));
    expect(used.size).toBe(17);
    for (const t of seed.themes) expect(t.hidden_until_min_books).toBe(!used.has(t.id));
    expect(seed.shelves).toHaveLength(10);
    expect(seed.shelves.filter((s) => s.hidden_until_min_books).map((s) => s.id).sort()).toEqual([
      "creativity-and-making",
      "faith-and-spirituality",
      "health-and-body",
    ]);
    // stoicism moved from Chosen Habits to Wisdom for Living.
    expect(seed.themes.find((t) => t.id === "chosen-habits")?.topics).not.toContain("stoicism");
    expect(seed.themes.find((t) => t.id === "wisdom-for-living")?.topics).toContain("stoicism");
    // Themes sit in areas that sit on shelves.
    const shelfIds = new Set(seed.shelves.map((s) => s.id));
    const areaIds = new Set(seed.areas.map((a) => a.id));
    for (const t of seed.themes) {
      expect(shelfIds.has(t.shelf_id)).toBe(true);
      expect(areaIds.has(t.area_id)).toBe(true);
    }
  });

  it("carries Maya Vaughn as a house author and strips the internal block from content", () => {
    const maya = seed.authors.find((a) => a.code === MAYA_VAUGHN_AUTHOR_CODE);
    expect(maya?.org_id).toBe(AKANA_HOUSE_ORG_ID);
    expect(maya?.is_demo).toBe(false);
    for (const v of seed.workbook_versions) {
      expect(v.semver).toBe("1.0.0");
      expect(v.schema_version).toBe("3.0");
      expect((v.content as Record<string, unknown>).internal).toBeUndefined();
      expect(v.content_hash).toBe(contentHash(v.content));
    }
  });

  it("uses the genre ids from the schema", () => {
    const genreIds = new Set(seed.genres.map((g) => g.id));
    expect(genreIds.size).toBe(11);
    for (const w of seed.workbooks) expect(genreIds.has(w.genre_id)).toBe(true);
  });
});

describe("ids and hashes", () => {
  it("formats stable version 5 style uuids", () => {
    const a = stableUuid("workbook:AK-TJWHK");
    expect(a).toMatch(UUID_RE);
    expect(stableUuid("workbook:AK-TJWHK")).toBe(a);
    expect(stableUuid("workbook:AK-A2BXW")).not.toBe(a);
    for (const w of seed.workbooks) expect(w.id).toMatch(UUID_RE);
  });

  it("changes the content hash when content changes and ignores key order", () => {
    const doc = { b: 1, a: { d: [1, 2], c: "x" } };
    const reordered = { a: { c: "x", d: [1, 2] }, b: 1 };
    expect(canonicalJson(doc)).toBe(canonicalJson(reordered));
    expect(contentHash(doc)).toBe(contentHash(reordered));
    expect(contentHash({ ...doc, b: 2 })).not.toBe(contentHash(doc));

    const first = seed.workbook_versions[0]!;
    const edited = { ...(first.content as Record<string, unknown>), card_line: "changed" };
    expect(contentHash(edited)).not.toBe(first.content_hash);
  });
});

describe("writers", () => {
  it("renders SQL with an upsert per table and the version pointer set last", () => {
    const sql = renderSeedSql(seed);
    expect(sql.startsWith("-- Akana catalogue seed")).toBe(true);
    expect(sql).toContain("begin;");
    expect(sql.trimEnd().endsWith("commit;")).toBe(true);
    expect(sql).toContain("insert into public.workbooks (");
    expect(sql).toContain("on conflict (id) do update set");
    expect(sql).toContain("on conflict (tenant_id, workbook_id) do update set");
    expect(sql).toContain("update public.workbooks set current_version_id = ");
    expect(sql).not.toContain("—"); // no em dashes anywhere in the seed
    // single quotes inside titles are doubled
    expect(sql).toContain("'The Elder''s Chair'");
    // the house organisation is referenced, never re-inserted
    expect(sql).not.toMatch(/insert into public\.organisations[^;]*'00000000-0000-0000-0000-000000000001'/);
  });

  it("batches rows 200 at a time", () => {
    const rows = Array.from({ length: 450 }, (_, i) => i);
    const batches = chunk(rows, 200);
    expect(batches.map((b) => b.length)).toEqual([200, 200, 50]);
  });
});
