import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSeed, buildSeedV2, repoRoot } from "./build";
import { AKANA_HOUSE_ORG_ID } from "./rows";
import { renderSeedSql } from "./sql";
import { V2_PREVIEW_PATH, renderSeedV2PreviewSql } from "./v2";

/**
 * Demo Catalogue v2 (F-153). These tests cover the preview only; seed.sql is
 * still built from v1 and must not move.
 */

const root = repoRoot();
const v1 = buildSeed();
const v2 = buildSeedV2();
const readJson = (...p: string[]) => JSON.parse(readFileSync(join(root, ...p), "utf8"));
const catalogueV1 = readJson("docs", "planning", "AK_Demo_Catalogue.json") as { workbooks: { code: string; id: string; url_slug: string; theme_id: string }[] };
const catalogueV2 = readJson("docs", "planning", "AK_Demo_Catalogue_v2.json") as {
  approval: { status: string };
  themes: { id: string; status: string }[];
  removed: { code: string; url_slug: string }[];
  workbooks: {
    code: string;
    code_status: string;
    is_demo: boolean;
    badge: string;
    status: string;
    release: string;
    fully_written: boolean;
    depth: string;
    genre: string;
    area_id: string | null;
    price_tier: string;
    shelf_id: string;
    theme_id: string;
    public_domain?: { tier: string; house_record?: { signed: boolean } };
    v2_source: string;
  }[];
  maya_vaughn: { theme_placements: { code: string; theme_id: string }[]; unplaced: { code: string }[] };
};
const registryThemes = readJson("content", "registry", "themes.json").themes as { id: string; status?: string }[];
const isMaya = (w: { badge: string }) => w.badge === "official";

describe("v1 output is unchanged", () => {
  it("supabase/seed/seed.sql is byte-identical to the v1 build", () => {
    expect(renderSeedSql(v1)).toBe(readFileSync(join(root, "supabase", "seed", "seed.sql"), "utf8"));
  });

  it("buildSeed defaults to v1", () => {
    expect(renderSeedSql(buildSeed({ catalogue: "v1" }))).toBe(renderSeedSql(v1));
    expect(v1.workbooks).toHaveLength(70);
  });
});

describe("buildSeedV2: counts", () => {
  it("holds 190 workbooks: 20 Maya Vaughn, 115 demo and 55 classics", () => {
    expect(v2.workbooks).toHaveLength(190);
    expect(v2.workbooks.filter(isMaya)).toHaveLength(20);
    expect(v2.workbooks.filter((w) => w.badge === "demo")).toHaveLength(115);
    expect(v2.workbooks.filter((w) => w.badge === "public_domain")).toHaveLength(55);
    expect(v2.books).toHaveLength(190);
    expect(v2.tenant_listings).toHaveLength(190);
    expect(v2.workbook_versions).toHaveLength(20);
  });

  it("holds 96 catalogue authors plus Maya Vaughn, and six imprints", () => {
    expect(v2.authors).toHaveLength(97);
    expect(v2.authors.filter((a) => a.is_demo)).toHaveLength(53);
    expect(v2.authors.filter((a) => a.is_public_domain)).toHaveLength(43);
    expect(v2.organisations.filter((o) => o.kind === "publisher")).toHaveLength(6);
    expect(v2.organisations.every((o) => o.is_demo)).toBe(true);
  });

  it("counts by shelf match the notes", () => {
    const shelfOf = new Map(v2.themes.map((t) => [t.id, t.shelf_id]));
    const count = new Map<string, number>();
    for (const w of v2.workbooks) {
      if (!w.theme_id) continue;
      const s = shelfOf.get(w.theme_id)!;
      count.set(s, (count.get(s) ?? 0) + 1);
    }
    expect(Object.fromEntries([...count].sort())).toEqual({
      "creativity-and-making": 9,
      "faith-and-spirituality": 47,
      "family-and-parenting": 14,
      "health-and-body": 9,
      "learning-and-skills": 16,
      "love-and-relationships": 10,
      "mind-and-mood": 27,
      money: 13,
      "personal-growth": 16,
      "work-and-career": 27,
    });
    // Finding Your People and Wired Differently have no Theme (N9).
    expect(v2.workbooks.filter((w) => !w.theme_id).map((w) => w.code).sort()).toEqual(["AK-EE7WH", "AK-WNQSH"]);
  });

  it("is deterministic", () => {
    expect(renderSeedV2PreviewSql(buildSeedV2())).toBe(renderSeedV2PreviewSql(v2));
  });
});

describe("buildSeedV2: codes", () => {
  it("gives every workbook, author and organisation a unique code and slug", () => {
    const dupes = (xs: string[]) => xs.filter((x, i) => xs.indexOf(x) !== i);
    expect(dupes(v2.workbooks.map((w) => w.code))).toEqual([]);
    expect(dupes(v2.workbooks.map((w) => w.slug))).toEqual([]);
    expect(dupes(v2.books.map((b) => b.slug))).toEqual([]);
    expect(dupes(v2.authors.map((a) => a.code))).toEqual([]);
    expect(dupes(v2.authors.map((a) => a.slug))).toEqual([]);
    expect(dupes(v2.organisations.map((o) => o.code ?? ""))).toEqual([]);
    for (const w of v2.workbooks) expect(w.code).toMatch(/^AK-[0-9A-HJKMNP-TV-Z]{5}$/);
    for (const a of v2.authors) expect(a.code).toMatch(/^AU-[0-9A-HJKMNP-TV-Z]{5}$/);
  });

  it("keeps every v1 workbook with its code, slug and ids, and mints no new code that v1 or the Maya Vaughn files hold", () => {
    const v2ByCode = new Map(v2.workbooks.map((w) => [w.code, w]));
    for (const w of v1.workbooks) {
      const same = v2ByCode.get(w.code);
      expect(same?.id).toBe(w.id);
      expect(same?.slug).toBe(w.slug);
      expect(same?.book_id).toBe(w.book_id);
    }
    for (const a of v1.authors) expect(v2.authors.find((b) => b.code === a.code)?.id).toBe(a.id);
    const v1Codes = new Set([...v1.workbooks.map((w) => w.code), ...v1.authors.map((a) => a.code), ...v1.organisations.map((o) => o.code)]);
    const provisional = catalogueV2.workbooks.filter((w) => w.code_status === "provisional");
    expect(provisional).toHaveLength(120);
    for (const w of provisional) expect(v1Codes.has(w.code)).toBe(false);
    const mayaFiles = readdirSync(join(root, "content", "workbooks", "v3")).filter((f) => f.endsWith(".json"));
    const mayaCodes = new Set(mayaFiles.map((f) => (readJson("content", "workbooks", "v3", f) as { code: string }).code));
    for (const w of provisional) expect(mayaCodes.has(w.code)).toBe(false);
  });

  it("never reuses a removed Bible study code or slug", () => {
    expect(catalogueV2.removed).toHaveLength(4);
    const codes = new Set(v2.workbooks.map((w) => w.code));
    const slugs = new Set(v2.workbooks.map((w) => w.slug));
    for (const r of catalogueV2.removed) {
      expect(codes.has(r.code)).toBe(false);
      expect(slugs.has(r.url_slug)).toBe(false);
    }
  });

  it("has one author record per real person", () => {
    const names = v2.authors.map((a) => a.display_name);
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
    const titlesBy = (name: string) =>
      v2.workbooks.filter((w) => w.book_id && v2.book_contributors.some((c) => c.book_id === w.book_id && c.author_id === v2.authors.find((a) => a.display_name === name)?.id)).length;
    expect(titlesBy("Henry David Thoreau")).toBe(2);
    expect(titlesBy("Marcus Tullius Cicero")).toBe(2);
    expect(titlesBy("Benjamin Franklin")).toBe(2);
    expect(titlesBy("Arnold Bennett")).toBe(4);
    expect(titlesBy("Samuel Smiles")).toBe(2);
    expect(v2.workbooks.filter((w) => w.title === "Walden")).toHaveLength(1);
    expect(v2.workbooks.filter((w) => w.title === "The Autobiography of Benjamin Franklin")).toHaveLength(1);
  });
});

describe("buildSeedV2: Themes", () => {
  it("puts at least three titles on every active Theme once classics are counted", () => {
    const active = v2.themes.filter((t) => t.status === "active");
    expect(active).toHaveLength(50);
    for (const t of active) {
      const n = v2.workbooks.filter((w) => w.theme_id === t.id).length;
      expect(n, t.id).toBeGreaterThanOrEqual(3);
      expect(n, t.id).toBeGreaterThanOrEqual(t.min_books);
    }
  });

  it("puts no title on a retired Theme", () => {
    const retired = new Set(v2.themes.filter((t) => t.status === "retired").map((t) => t.id));
    expect([...retired]).toEqual(["reading-scripture"]);
    for (const w of v2.workbooks) expect(retired.has(w.theme_id ?? "")).toBe(false);
  });

  it("lists the same Themes as the registry", () => {
    expect(catalogueV2.themes.map((t) => [t.id, t.status])).toEqual(
      registryThemes.map((t) => [t.id, t.status === "retired" ? "retired" : "active"]),
    );
  });

  it("never sets a title below its Theme's tier, except the Maya Vaughn titles kept at their own tier (N8)", () => {
    const order = { none: 0, standard: 1, higher: 2 } as const;
    const themeTier = new Map(
      (readJson("content", "registry", "themes.json").themes as { id: string; safety_tier: keyof typeof order }[]).map((t) => [t.id, t.safety_tier]),
    );
    const below = v2.workbooks.filter((w) => w.theme_id && order[w.safety_tier] < order[themeTier.get(w.theme_id)!]);
    expect(below.every(isMaya)).toBe(true);
    expect(below.map((w) => w.code).sort()).toEqual(["AK-5J1Q7", "AK-M1AAC", "AK-NXD2Q", "AK-VQ6SF"]);
  });

  it("places 18 Maya Vaughn titles by row only and keeps their tiers and content", () => {
    expect(catalogueV2.maya_vaughn.theme_placements).toHaveLength(18);
    const v1Maya = new Map(v1.workbooks.filter(isMaya).map((w) => [w.code, w]));
    for (const w of v2.workbooks.filter(isMaya)) {
      const before = v1Maya.get(w.code)!;
      expect(w.safety_tier).toBe(before.safety_tier);
      expect(w.status).toBe("in_review");
      expect(w.current_version_id).toBe(before.current_version_id);
    }
    expect(v2.workbook_versions.map((v) => v.content_hash)).toEqual(v1.workbook_versions.map((v) => v.content_hash));
  });
});

describe("buildSeedV2: badges, status and listing values", () => {
  it("badges demo titles demo and classics public_domain, all draft", () => {
    for (const w of v2.workbooks.filter((x) => !isMaya(x))) {
      expect(w.status).toBe("draft");
      expect(w.current_version_id).toBeNull();
      if (w.is_demo) expect(w.badge).toBe("demo");
      else {
        expect(w.badge).toBe("public_domain");
        expect(w.org_id).toBe(AKANA_HOUSE_ORG_ID);
      }
    }
    for (const w of catalogueV2.workbooks) {
      expect(w.status).toBe("draft");
      expect(w.badge).toBe(w.is_demo ? "demo" : "public_domain");
      if (!w.is_demo) expect(w.public_domain?.house_record?.signed).toBe(false);
    }
  });

  it("stores only death years the database accepts (0002: 0 to 2100); Cicero's 43 BCE becomes null", () => {
    for (const c of v2.book_contributors) if (c.death_year !== null) expect(c.death_year).toBeGreaterThanOrEqual(0);
    const cicero = v2.authors.find((a) => a.display_name === "Marcus Tullius Cicero")!;
    const rows = v2.book_contributors.filter((c) => c.author_id === cicero.id);
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(r.death_year).toBeNull();
    const aurelius = v2.authors.find((a) => a.display_name === "Marcus Aurelius")!;
    expect(v2.book_contributors.find((c) => c.author_id === aurelius.id)?.death_year).toBe(180);
  });

  it("keeps the three Tier B classics off sale (N11)", () => {
    const tierB = catalogueV2.workbooks.filter((w) => w.public_domain?.tier === "B");
    expect(tierB.map((w) => w.code).sort()).toEqual(["AK-DQXE1", "AK-HHGT0", "AK-WXE4R"]);
    for (const w of tierB) expect(w.release).toBe("tier_b_off_sale_at_launch");
  });

  it("marks every new title not fully written, at first-week depth, with a price tier, an area and a hyphenated genre", () => {
    const fresh = catalogueV2.workbooks.filter((w) => w.v2_source !== "docs/planning/AK_Demo_Catalogue.json");
    expect(fresh).toHaveLength(120);
    for (const w of fresh) {
      expect(w.fully_written).toBe(false);
      expect(w.depth).toBe("first_week");
      expect(w.code_status).toBe("provisional");
    }
    for (const w of catalogueV2.workbooks) {
      expect(["short", "standard", "extended", "programme"]).toContain(w.price_tier);
      expect(w.area_id).toBeTruthy();
      expect(w.genre).not.toContain("_");
    }
    expect(catalogueV2.workbooks.filter((w) => w.shelf_id === "health-and-body").every((w) => w.area_id === "everyday-health")).toBe(true);
    const themeArea = new Map((readJson("content", "registry", "themes.json").themes as { id: string; area_id: string }[]).map((t) => [t.id, t.area_id]));
    for (const w of catalogueV2.workbooks) expect(w.area_id, w.code).toBe(themeArea.get(w.theme_id));
  });

  it("is still awaiting Crent's approval", () => {
    expect(catalogueV2.approval.status).toBe("awaiting Crent");
  });
});

describe("seed_v2_preview.sql", () => {
  const sql = readFileSync(join(root, ...V2_PREVIEW_PATH), "utf8");

  it("is current with the v2 build", () => {
    expect(sql).toBe(renderSeedV2PreviewSql(v2));
  });

  it("is headed DO NOT APPLY and refuses to run without the scratch setting", () => {
    expect(sql.startsWith("-- DO NOT APPLY UNTIL CRENT APPROVES.")).toBe(true);
    const begin = sql.indexOf("begin;");
    const guard = sql.indexOf("akana.apply_v2_preview', true)");
    const firstInsert = sql.indexOf("insert into");
    expect(begin).toBeGreaterThan(0);
    expect(guard).toBeGreaterThan(begin);
    expect(guard).toBeLessThan(firstInsert);
    expect(sql).not.toContain("—");
    expect(sql).not.toMatch(/insert into public\.organisations[^;]*'00000000-0000-0000-0000-000000000001'/);
  });

  it("is not seed.sql", () => {
    expect(V2_PREVIEW_PATH.join("/")).toBe("supabase/seed/seed_v2_preview.sql");
    expect(sql).not.toBe(readFileSync(join(root, "supabase", "seed", "seed.sql"), "utf8"));
  });
});
