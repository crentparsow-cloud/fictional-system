import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { GENRES, WorkbookV3, stripInternal, type Genre } from "@akana/schema";
import { z } from "zod";
import { contentHash, stableUuid } from "./ids";
import {
  AKANA_HOUSE_ORG_ID,
  MARKETPLACE_TENANT_ID,
  MAYA_VAUGHN_AUTHOR_CODE,
  type AreaRow,
  type AuthorRow,
  type BookContributorRow,
  type BookRow,
  type GenreRow,
  type Json,
  type OrganisationRow,
  type Seed,
  type ShelfRow,
  type TenantListingRow,
  type ThemeRow,
  type WorkbookRow,
  type WorkbookVersionRow,
} from "./rows";

/**
 * buildSeed reads the registry (content/registry), the demo catalogue
 * (docs/planning/AK_Demo_Catalogue.json) and the 20 Maya Vaughn v3 workbooks
 * (content/workbooks/v3) and returns plain row arrays. Nothing here touches a
 * database. Ids are derived from codes and slugs, so two runs give the same rows.
 */

// ---------- input shapes (only the fields the seed reads) ----------

const RegistryGenre = z.object({
  id: z.enum(GENRES),
  name: z.string(),
  default_safety_tier: z.enum(["none", "standard", "higher"]),
  guardrails: z.record(z.unknown()),
});
const RegistryShelf = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  sort: z.number().int(),
  hidden_until_min_books: z.boolean().default(false),
});
const RegistryArea = z.object({ id: z.string(), shelf_id: z.string(), name: z.string() });
const RegistryTheme = z.object({
  id: z.string(),
  name: z.string(),
  line: z.string().nullable(),
  shelf_id: z.string(),
  area_id: z.string(),
  topics: z.array(z.string()),
  clearance_status: z.string(),
  min_books: z.number().int(),
  group_suitable: z.boolean().default(false),
  hidden_until_min_books: z.boolean().default(false),
});

const CataloguePublisher = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  city: z.string().optional(),
  country: z.string(),
  is_demo: z.boolean(),
});
const CatalogueAuthor = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  country: z.string(),
  publisher_id: z.string().nullable(),
  publisher: z.string(),
  spelling: z.string(),
  bio: z.string(),
  is_demo: z.boolean(),
  is_public_domain: z.boolean(),
});
const CatalogueWorkbook = z.object({
  id: z.string(),
  code: z.string(),
  url_slug: z.string(),
  title: z.string(),
  subtitle: z.string(),
  author_id: z.string(),
  publisher_id: z.string().nullable(),
  publisher: z.string(),
  genre: z.string(),
  theme_id: z.string(),
  card_line: z.string(),
  depth: z.enum(["full", "first_week", "outline", "listing"]),
  safety_profile: z.enum(["none", "wellbeing_standard", "wellbeing_higher"]),
  is_demo: z.boolean(),
  language: z.string(),
  spelling: z.string(),
  public_domain: z
    .object({
      edition: z.string().optional(),
      people: z.array(z.object({ name: z.string(), died: z.number().int(), role: z.string() })),
    })
    .optional(),
});
const Catalogue = z.object({
  publishers: z.array(CataloguePublisher),
  authors: z.array(CatalogueAuthor),
  workbooks: z.array(CatalogueWorkbook),
});

// ---------- helpers ----------

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Catalogue genre ids use hyphens; the schema uses underscores. */
export function toGenreId(catalogueGenre: string): Genre {
  const id = catalogueGenre.replace(/-/g, "_");
  if (!(GENRES as readonly string[]).includes(id)) throw new Error(`unknown genre ${catalogueGenre}`);
  return id as Genre;
}

/** Catalogue depth "first_week" is the schema's "first_unit". */
export function toDepth(d: z.infer<typeof CatalogueWorkbook>["depth"]): WorkbookRow["depth"] {
  return d === "first_week" ? "first_unit" : d;
}

export function toSafetyTier(p: z.infer<typeof CatalogueWorkbook>["safety_profile"]): WorkbookRow["safety_tier"] {
  if (p === "wellbeing_standard") return "standard";
  if (p === "wellbeing_higher") return "higher";
  return "none";
}

/** The authors table allows en-GB and en-US only. en-AU and en-CA follow British spelling for the pairs the validator checks. */
export function toSpelling(s: string): "en-GB" | "en-US" {
  return s === "en-US" ? "en-US" : "en-GB";
}

export const ids = {
  org: (code: string) => stableUuid(`organisation:${code}`),
  author: (code: string) => stableUuid(`author:${code}`),
  book: (slug: string) => stableUuid(`book:${slug}`),
  workbook: (code: string) => stableUuid(`workbook:${code}`),
  version: (code: string, semver: string) => stableUuid(`workbook_version:${code}:${semver}`),
};

export interface BuildOptions {
  /** Repository root. Defaults to three levels above this file. */
  root?: string;
}

export function repoRoot(): string {
  return join(import.meta.dirname, "..", "..", "..");
}

// ---------- the builder ----------

export function buildSeed(opts: BuildOptions = {}): Seed {
  const root = opts.root ?? repoRoot();
  const registryDir = join(root, "content", "registry");

  const genres: GenreRow[] = z
    .object({ genres: z.array(RegistryGenre) })
    .parse(readJson(join(registryDir, "genres.json")))
    .genres.map((g) => ({ id: g.id, name: g.name, default_safety_tier: g.default_safety_tier, guardrails: g.guardrails as Json }));
  const shelves: ShelfRow[] = z
    .object({ shelves: z.array(RegistryShelf) })
    .parse(readJson(join(registryDir, "shelves.json")))
    .shelves.map((s) => ({ id: s.id, name: s.name, status: s.status, sort: s.sort, hidden_until_min_books: s.hidden_until_min_books }));
  const areas: AreaRow[] = z.object({ areas: z.array(RegistryArea) }).parse(readJson(join(registryDir, "areas.json"))).areas;
  const themes: ThemeRow[] = z
    .object({ themes: z.array(RegistryTheme) })
    .parse(readJson(join(registryDir, "themes.json")))
    .themes.map((t) => ({
      id: t.id,
      name: t.name,
      line: t.line,
      shelf_id: t.shelf_id,
      area_id: t.area_id,
      topics: t.topics,
      clearance_status: t.clearance_status,
      min_books: t.min_books,
      group_suitable: t.group_suitable,
      hidden_until_min_books: t.hidden_until_min_books,
    }));

  const catalogue = Catalogue.parse(readJson(join(root, "docs", "planning", "AK_Demo_Catalogue.json")));

  const organisations: OrganisationRow[] = [];
  const authors: AuthorRow[] = [];
  const books: BookRow[] = [];
  const book_contributors: BookContributorRow[] = [];
  const workbooks: WorkbookRow[] = [];
  const workbook_versions: WorkbookVersionRow[] = [];
  const tenant_listings: TenantListingRow[] = [];

  // Demo publishers become publisher organisations.
  for (const p of catalogue.publishers) {
    organisations.push({
      id: ids.org(p.id),
      code: p.id,
      kind: "publisher",
      legal_name: p.name,
      display_name: p.name,
      slug: p.slug,
      country: p.country,
      is_demo: p.is_demo,
    });
  }

  // Authors. A demo author without a publisher gets an individual organisation
  // carrying the author's own AU- code. Public-domain authors belong to the
  // house, because the workbook around the text is Akana's.
  const authorOrg = new Map<string, string>();
  for (const a of catalogue.authors) {
    let orgId: string;
    if (a.publisher_id) {
      orgId = ids.org(a.publisher_id);
    } else if (a.is_public_domain) {
      orgId = AKANA_HOUSE_ORG_ID;
    } else {
      orgId = ids.org(a.id);
      organisations.push({
        id: orgId,
        code: a.id,
        kind: "individual",
        legal_name: a.name,
        display_name: a.name,
        slug: a.slug,
        country: a.country.length === 2 ? a.country : null,
        is_demo: a.is_demo,
      });
    }
    authorOrg.set(a.id, orgId);
    authors.push({
      id: ids.author(a.id),
      code: a.id,
      org_id: orgId,
      slug: a.slug,
      display_name: a.name,
      legal_name: a.is_demo ? a.name : null,
      bio: a.bio,
      country: a.country.length === 2 ? a.country : null,
      photo_path: null,
      website: null,
      spelling: toSpelling(a.spelling),
      is_demo: a.is_demo,
      is_public_domain: a.is_public_domain,
      status: "active",
    });
  }

  // Maya Vaughn: real pen name, house organisation, not demo.
  authors.push({
    id: ids.author(MAYA_VAUGHN_AUTHOR_CODE),
    code: MAYA_VAUGHN_AUTHOR_CODE,
    org_id: AKANA_HOUSE_ORG_ID,
    slug: "maya-vaughn",
    display_name: "Maya Vaughn",
    legal_name: null,
    bio: null,
    country: null,
    photo_path: null,
    website: null,
    spelling: "en-US",
    is_demo: false,
    is_public_domain: false,
    status: "active",
  });

  let sort = 0;

  // The 20 Maya Vaughn workbooks: one version each from the v3 files.
  const v3Dir = join(root, "content", "workbooks", "v3");
  const v3Files = readdirSync(v3Dir).filter((f) => f.endsWith(".json")).sort();
  for (const file of v3Files) {
    const doc = WorkbookV3.parse(readJson(join(v3Dir, file)));
    if (doc.author.author_id !== MAYA_VAUGHN_AUTHOR_CODE) throw new Error(`${file}: expected a Maya Vaughn workbook`);
    const bookId = ids.book(doc.book.book_id);
    books.push({
      id: bookId,
      org_id: AKANA_HOUSE_ORG_ID,
      slug: doc.book.book_id,
      title: doc.book.title,
      subtitle: doc.book.subtitle ?? null,
      edition: null,
      language: doc.language,
      isbns: doc.book.isbn ? [doc.book.isbn] : [],
      asin: doc.book.asin ?? null,
      store_links: (doc.book.store_links ?? {}) as Json,
      cover_path: null,
      rights_status: "own_work",
      publisher: doc.book.publisher ?? null,
      year: doc.book.year ?? null,
      is_demo: false,
    });
    book_contributors.push({ book_id: bookId, author_id: ids.author(MAYA_VAUGHN_AUTHOR_CODE), role: "author", death_year: null, sort: 0 });

    const content = stripInternal(doc) as unknown as Json;
    const semver = "1.0.0";
    const workbookId = ids.workbook(doc.code);
    const versionId = ids.version(doc.code, semver);
    workbook_versions.push({
      id: versionId,
      workbook_id: workbookId,
      semver,
      schema_version: doc.schema_version,
      content,
      content_hash: contentHash(content),
      validated_at: null,
      published_at: null,
    });
    workbooks.push({
      id: workbookId,
      code: doc.code,
      book_id: bookId,
      org_id: AKANA_HOUSE_ORG_ID,
      tenant_id: MARKETPLACE_TENANT_ID,
      slug: doc.slug,
      title: doc.title,
      short_title: doc.short_title ?? null,
      card_line: doc.card_line,
      genre_id: doc.genre,
      theme_id: doc.theme_id ?? null,
      safety_tier: doc.safety_tier,
      depth: "full",
      badge: "official",
      is_demo: false,
      status: "in_review",
      current_version_id: versionId,
      licence_ref: doc.licence_ref ?? null,
    });
    tenant_listings.push({ tenant_id: MARKETPLACE_TENANT_ID, workbook_id: workbookId, visible: true, sort: sort++, featured: false });
  }

  // The 50 catalogue workbooks: listing rows only, no content yet.
  const authorsByCode = new Map(catalogue.authors.map((a) => [a.id, a]));
  for (const w of catalogue.workbooks) {
    const author = authorsByCode.get(w.author_id);
    if (!author) throw new Error(`${w.code}: unknown author ${w.author_id}`);
    const orgId = w.publisher_id ? ids.org(w.publisher_id) : authorOrg.get(w.author_id);
    if (!orgId) throw new Error(`${w.code}: no organisation for ${w.author_id}`);
    const isClassic = Boolean(w.public_domain);
    const bookId = ids.book(w.id);
    books.push({
      id: bookId,
      org_id: orgId,
      slug: w.id,
      title: w.title,
      subtitle: w.subtitle,
      edition: w.public_domain?.edition ?? null,
      language: w.language,
      isbns: [],
      asin: null,
      store_links: {},
      cover_path: null,
      rights_status: isClassic ? "public_domain" : "licensed",
      publisher: w.publisher,
      year: null,
      is_demo: w.is_demo,
    });
    const died = w.public_domain?.people.find((p) => p.role === "author" && p.name === author.name)?.died ?? null;
    book_contributors.push({ book_id: bookId, author_id: ids.author(w.author_id), role: "author", death_year: died, sort: 0 });

    const workbookId = ids.workbook(w.code);
    workbooks.push({
      id: workbookId,
      code: w.code,
      book_id: bookId,
      org_id: orgId,
      tenant_id: MARKETPLACE_TENANT_ID,
      slug: w.url_slug,
      title: w.title,
      short_title: null,
      card_line: w.card_line,
      genre_id: toGenreId(w.genre),
      theme_id: w.theme_id,
      safety_tier: toSafetyTier(w.safety_profile),
      depth: toDepth(w.depth),
      badge: w.is_demo ? "demo" : isClassic ? "public_domain" : "official",
      is_demo: w.is_demo,
      status: "draft",
      current_version_id: null,
      licence_ref: null,
    });
    tenant_listings.push({ tenant_id: MARKETPLACE_TENANT_ID, workbook_id: workbookId, visible: true, sort: sort++, featured: false });
  }

  const seed: Seed = { genres, shelves, areas, themes, organisations, authors, books, book_contributors, workbooks, workbook_versions, tenant_listings };
  checkIntegrity(seed);
  return seed;
}

/** Referential checks that would otherwise only fail at insert time. */
function checkIntegrity(seed: Seed): void {
  const themeIds = new Set(seed.themes.map((t) => t.id));
  const shelfIds = new Set(seed.shelves.map((s) => s.id));
  const areaIds = new Set(seed.areas.map((a) => a.id));
  const orgIds = new Set([AKANA_HOUSE_ORG_ID, ...seed.organisations.map((o) => o.id)]);
  const problems: string[] = [];

  for (const a of seed.areas) if (!shelfIds.has(a.shelf_id)) problems.push(`area ${a.id} on unknown shelf ${a.shelf_id}`);
  for (const t of seed.themes) {
    if (!shelfIds.has(t.shelf_id)) problems.push(`theme ${t.id} on unknown shelf ${t.shelf_id}`);
    if (!areaIds.has(t.area_id)) problems.push(`theme ${t.id} in unknown area ${t.area_id}`);
  }
  for (const w of seed.workbooks) {
    if (w.theme_id && !themeIds.has(w.theme_id)) problems.push(`workbook ${w.code} uses unknown theme ${w.theme_id}`);
    if (!orgIds.has(w.org_id)) problems.push(`workbook ${w.code} has unknown organisation`);
    if (w.is_demo && w.badge === "official") problems.push(`workbook ${w.code} is demo but badged official`);
  }
  for (const a of seed.authors) if (!orgIds.has(a.org_id)) problems.push(`author ${a.code} has unknown organisation`);

  const dupes = (xs: string[]) => xs.filter((x, i) => xs.indexOf(x) !== i);
  for (const [name, list] of Object.entries(seed) as [keyof Seed, { id?: string }[]][]) {
    const withIds = list.map((r) => r.id).filter((x): x is string => typeof x === "string");
    for (const d of new Set(dupes(withIds))) problems.push(`${name}: duplicate id ${d}`);
  }
  for (const d of new Set(dupes(seed.workbooks.map((w) => w.code)))) problems.push(`duplicate workbook code ${d}`);
  for (const d of new Set(dupes(seed.workbooks.map((w) => w.slug)))) problems.push(`duplicate workbook slug ${d}`);

  if (problems.length) throw new Error(`seed integrity:\n  ${problems.join("\n  ")}`);
}
