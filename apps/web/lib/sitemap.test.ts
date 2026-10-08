import { describe, expect, it } from "vitest";
import type { Publisher, ThemeInput } from "./author-theme-pages";
import type { LibraryCard } from "./catalogue-types";
import { STATIC_PUBLIC_PATHS, buildRobots, buildSitemap, isPrivatePath, siteOriginForRequest, sitemapPaths } from "./sitemap";

function card(over: Partial<LibraryCard> & Pick<LibraryCard, "id" | "slug" | "code">): LibraryCard {
  return {
    title: over.slug,
    shortTitle: null,
    cardLine: "",
    genreId: "business",
    genreName: "Business",
    themeId: null,
    themeName: null,
    badge: "official",
    isDemo: false,
    depth: "full",
    safetyTier: "none",
    authors: [],
    hasVersion: true,
    authorRefs: [],
    ...over,
  };
}

const theme = (id: string): ThemeInput => ({ id, name: id, line: null, shelfId: "s", shelfName: "Shelf" });
const publisher = (slug: string, codes: string[], isDemo: boolean): Publisher => ({ slug, code: `PB-${slug}`, name: slug, city: null, country: null, note: null, isDemo, codes });

const cards = [
  card({ id: "1", slug: "real-book", code: "AK-AAAA1", themeId: "focus", authorRefs: [{ slug: "real-author", name: "Real" }] }),
  card({ id: "2", slug: "demo-book", code: "AK-BBBB2", isDemo: true, badge: "demo", themeId: "calm", authorRefs: [{ slug: "demo-author", name: "Demo" }] }),
];

const input = {
  cards,
  themes: [theme("focus"), theme("calm"), theme("empty")],
  publishers: [publisher("real-press", ["AK-AAAA1"], false), publisher("demo-press", ["AK-BBBB2"], true), publisher("idle-press", ["AK-ZZZZ9"], false)],
  publicDomainCodes: ["AK-3TQX1", "../x"],
  helpTopics: ["account", "help-now"],
  legalDocs: ["terms", "privacy"],
};

describe("sitemap (F-011)", () => {
  const paths = sitemapPaths(input);

  it("lists the public pages, help, legal and public-domain records", () => {
    for (const p of STATIC_PUBLIC_PATHS) expect(paths).toContain(p);
    for (const p of ["/help/account", "/help/help-now", "/legal/terms", "/legal/privacy", "/public-domain/AK-3TQX1"]) expect(paths).toContain(p);
    for (const p of ["/w", "/themes", "/authors", "/publishers", "/public-domain", "/legal", "/help"]) expect(paths.some((x) => x === p || x.startsWith(`${p}/`)), p).toBe(true);
  });

  it("lists live non-demo workbooks, authors and imprints", () => {
    expect(paths).toContain("/w/real-book");
    expect(paths).toContain("/authors/real-author");
    expect(paths).toContain("/publishers/real-press");
  });

  it("keeps out demo workbooks, demo authors and demo imprints, which are noindex", () => {
    expect(paths).not.toContain("/w/demo-book");
    expect(paths).not.toContain("/authors/demo-author");
    expect(paths).not.toContain("/publishers/demo-press");
  });

  it("lists Themes that hold a live workbook and skips empty ones", () => {
    expect(paths).toContain("/themes/focus");
    expect(paths).toContain("/themes/calm");
    expect(paths).not.toContain("/themes/empty");
    expect(paths).not.toContain("/publishers/idle-press");
  });

  it("never lists a retired Theme (0025) or a held one below its minimum, even with a live title", () => {
    const more = [
      ...cards,
      card({ id: "3", slug: "on-retired", code: "AK-CCCC3", themeId: "old-theme" }),
      card({ id: "4", slug: "on-held", code: "AK-DDDD4", themeId: "new-theme" }),
    ];
    const p = sitemapPaths({
      ...input,
      cards: more,
      themes: [...input.themes, { ...theme("old-theme"), retired: true }, { ...theme("new-theme"), held: true, minBooks: 3 }],
    });
    expect(p).not.toContain("/themes/old-theme");
    expect(p).not.toContain("/themes/new-theme");
    expect(p).toContain("/themes/focus");
    // the titles themselves stay listed
    expect(p).toContain("/w/on-retired");
  });

  it("never lists a private path or a malformed code", () => {
    for (const p of paths) expect(isPrivatePath(p), p).toBe(false);
    expect(paths.some((p) => p.includes(".."))).toBe(false);
  });

  it("gives every entry en-GB, en-US and x-default alternates on the same URL", () => {
    const map = buildSitemap({ ...input, origin: "https://akana.example" });
    const home = map.find((e) => e.url === "https://akana.example/");
    expect(home?.alternates?.languages).toEqual({
      "en-GB": "https://akana.example/",
      "en-US": "https://akana.example/",
      "x-default": "https://akana.example/",
    });
    for (const e of map) expect(e.url.startsWith("https://akana.example/")).toBe(true);
  });
});

describe("robots (F-011)", () => {
  it("allows public pages, disallows private ones and points to the sitemap", () => {
    const r = buildRobots("https://akana.example");
    expect(r.sitemap).toBe("https://akana.example/sitemap.xml");
    const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    expect(rule?.allow).toBe("/");
    for (const p of ["/you", "/read/", "/api/", "/admin", "/respond/", "/terms"]) expect(rule?.disallow).toContain(p);
  });

  it("treats only real private paths as private", () => {
    expect(isPrivatePath("/you")).toBe(true);
    expect(isPrivatePath("/read/focus")).toBe(true);
    expect(isPrivatePath("/admin/workbooks")).toBe(true);
    expect(isPrivatePath("/trust")).toBe(false);
    expect(isPrivatePath("/help")).toBe(false);
    expect(isPrivatePath("/help-now")).toBe(false);
  });

  it("uses the configured origin on the marketplace and the host on a white-label site", () => {
    expect(siteOriginForRequest("marketplace", "evil.example", { AKANA_HOST: "akana.example" })).toBe("https://akana.example");
    expect(siteOriginForRequest("white_label", "Books.Press.example", { AKANA_HOST: "akana.example" })).toBe("https://books.press.example");
    expect(siteOriginForRequest("white_label", "bad host/", { AKANA_HOST: "akana.example" })).toBe("https://akana.example");
  });
});
