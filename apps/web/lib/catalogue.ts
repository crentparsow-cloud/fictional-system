import "server-only";
import type { Badge, ContinueCard, Depth, EnrolmentStatus, LibraryCard, ListingBody, SafetyTier, ShelfWithThemes, StartBody, WorkbookDetail } from "@/lib/catalogue-types";
import { firstUnitGaps, type FirstUnitGap } from "@/lib/first-unit";
import { isFreeUnitKind } from "@/lib/free-label";
import { createUserClient } from "@/lib/supabase/server";
import { MARKETPLACE_TENANT_ID, tenantIdForRequest } from "@/lib/tenant-id";
// Demo catalogue, read for programme length only (see demoUnitCounts below).
import demoCatalogue from "../../../docs/planning/AK_Demo_Catalogue.json";

export type { ContinueCard, LibraryCard, ListingBody, ShelfWithThemes, StartBody, WorkbookDetail } from "@/lib/catalogue-types";

/**
 * Typed catalogue queries over the user client, so RLS decides what a visitor
 * or reader sees (0002: public workbooks for everyone, drafts for their own
 * organisation and staff). Every select names its columns. authors is only
 * ever read as slug and display_name: legal_name has no client grant and must
 * never be asked for. themes.topics is never selected.
 */

// Named columns only. The nested authors select is slug and display_name alone.
const CARD_COLUMNS =
  "id, code, slug, title, short_title, card_line, genre_id, theme_id, badge, is_demo, depth, safety_tier, current_version_id, price_point_id, in_membership, created_at, " +
  "genres(name), themes(name), books(title, language, book_contributors(role, sort, authors(slug, display_name)))";

interface CardRow {
  id: string;
  code: string;
  slug: string;
  title: string;
  short_title: string | null;
  card_line: string;
  genre_id: string;
  theme_id: string | null;
  badge: Badge;
  is_demo: boolean;
  depth: Depth;
  safety_tier: SafetyTier;
  current_version_id: string | null;
  price_point_id: string | null;
  in_membership: boolean | null;
  created_at?: string | null;
  genres: { name: string } | null;
  themes: { name: string } | null;
  books: {
    title: string;
    language: string;
    book_contributors: { role: string; sort: number; authors: { slug: string; display_name: string } | null }[];
  } | null;
}

function toCard(row: CardRow): LibraryCard {
  const authorRefs = (row.books?.book_contributors ?? [])
    .filter((c) => c.role === "author" && c.authors?.display_name)
    .sort((a, b) => a.sort - b.sort)
    .map((c) => ({ slug: c.authors!.slug, name: c.authors!.display_name }));
  const authors = authorRefs.map((a) => a.name);
  return {
    id: row.id,
    code: row.code,
    slug: row.slug,
    title: row.title,
    shortTitle: row.short_title,
    cardLine: row.card_line,
    genreId: row.genre_id,
    genreName: row.genres?.name ?? row.genre_id,
    themeId: row.theme_id,
    themeName: row.themes?.name ?? null,
    badge: row.badge,
    isDemo: row.is_demo,
    depth: row.depth,
    safetyTier: row.safety_tier,
    authors,
    hasVersion: row.current_version_id !== null,
    authorRefs,
    language: row.books?.language ?? "en",
    unitCount: null,
    unitKind: null,
    addedAt: row.created_at ?? null,
    freeUnits: null,
    inMembership: row.in_membership !== false,
  };
}

/**
 * Programme length for demo titles that have no published version yet, so no
 * listing section to read. Keyed by AK code from the demo catalogue's weeks
 * figure. A published listing's structure.count always wins over this.
 */
let demoCounts: Map<string, number> | null = null;
function demoUnitCounts(): Map<string, number> {
  if (!demoCounts) {
    demoCounts = new Map();
    for (const w of (demoCatalogue as { workbooks: { code: string; weeks?: number }[] }).workbooks) {
      if (typeof w.weeks === "number") demoCounts.set(w.code, w.weeks);
    }
  }
  return demoCounts;
}

/**
 * Fills unitCount on each card: structure.count from the published listing
 * section where there is one, otherwise the demo catalogue's figure. One
 * query on the indexed version_id column, one named JSON path.
 */
async function withUnitCounts(supabase: Awaited<ReturnType<typeof createUserClient>>, rows: CardRow[], cards: LibraryCard[]): Promise<LibraryCard[]> {
  const versionIds = [...new Set(rows.map((r) => r.current_version_id).filter((v): v is string => v !== null))];
  const byVersion = new Map<string, number>();
  const kindByVersion = new Map<string, NonNullable<LibraryCard["unitKind"]>>();
  const freeByVersion = new Map<string, number>();
  if (versionIds.length) {
    const { data, error } = await supabase
      .from("workbook_sections")
      .select("version_id, count:body->structure->count, unit:body->structure->>unit, free_units:body->structure->free_units")
      .eq("kind", "listing")
      .in("version_id", versionIds);
    if (error) throw new Error(`listLibrary lengths: ${error.message}`);
    for (const s of (data ?? []) as unknown as { version_id: string; count: unknown; unit: unknown; free_units: unknown }[]) {
      if (typeof s.count === "number" && Number.isFinite(s.count)) byVersion.set(s.version_id, s.count);
      if (isFreeUnitKind(s.unit)) kindByVersion.set(s.version_id, s.unit);
      if (typeof s.free_units === "number" && Number.isFinite(s.free_units)) freeByVersion.set(s.version_id, s.free_units);
    }
  }
  const demo = demoUnitCounts();
  return cards.map((card, i) => {
    const v = rows[i]?.current_version_id;
    const published = v ? byVersion.get(v) : undefined;
    const count = published ?? demo.get(card.code) ?? null;
    // The demo catalogue's figure is in weeks. A published listing says its own unit.
    const kind = (v ? kindByVersion.get(v) : undefined) ?? (published === undefined && count !== null ? "week" : null);
    return { ...card, unitCount: count, unitKind: kind, freeUnits: (v ? freeByVersion.get(v) : undefined) ?? null };
  });
}

/**
 * Policy 7.9: the unit 1 section of each current version, so only a title
 * whose first unit is complete reaches a public list. Unit 1 is free, so
 * anyone can read it for a public title; a row RLS withholds counts as
 * missing. Keyed by workbook id.
 */
export async function firstUnitGapsFor(
  supabase: Awaited<ReturnType<typeof createUserClient>>,
  rows: readonly { id: string; current_version_id: string | null }[],
): Promise<Map<string, FirstUnitGap>> {
  const versionIds = [...new Set(rows.map((r) => r.current_version_id).filter((v): v is string => v !== null))];
  let units: { version_id: string; body: unknown }[] = [];
  if (versionIds.length) {
    const { data, error } = await supabase.from("workbook_sections").select("version_id, body").eq("kind", "unit").eq("unit_number", 1).in("version_id", versionIds);
    if (error) throw new Error(`firstUnitGapsFor: ${error.message}`);
    units = (data ?? []) as { version_id: string; body: unknown }[];
  }
  return firstUnitGaps(rows, units);
}

/** The rows whose first unit is complete, in the same order. */
export function onlyComplete<T extends { id: string }>(rows: readonly T[], gaps: Map<string, FirstUnitGap>): T[] {
  return rows.filter((r) => gaps.get(r.id)?.complete === true);
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const GENRE = /^[a-z_]+$/;

export interface LibraryFilter {
  genre?: string;
  theme?: string;
  q?: string;
}

/**
 * Live workbooks on this tenant as cards, optionally narrowed by genre,
 * Theme or a title search. Capped at 200 rows: the library is grouped on the
 * page, and a catalogue past that size gets paging in week 3.
 *
 * Policy 7.9: a live title whose first unit is not complete (lib/first-unit.ts)
 * is left out here, so the library, Explore, the Theme, author and publisher
 * pages, the home page and the sitemap all follow one rule. Staff see such
 * titles, with the reason, on /admin/workbooks.
 */
export async function listLibrary(filter: LibraryFilter = {}): Promise<LibraryCard[]> {
  const supabase = await createUserClient();
  const tenantId = (await tenantIdForRequest()) ?? MARKETPLACE_TENANT_ID;
  let query = supabase.from("workbooks").select(CARD_COLUMNS).eq("tenant_id", tenantId).eq("status", "live").order("title").limit(200);
  if (filter.genre && GENRE.test(filter.genre)) query = query.eq("genre_id", filter.genre);
  if (filter.theme && SLUG.test(filter.theme)) query = query.eq("theme_id", filter.theme);
  const q = (filter.q ?? "").trim().replace(/[%_,().]/g, " ").trim().slice(0, 80);
  if (q) query = query.ilike("title", `%${q}%`);
  const { data, error } = await query;
  if (error) throw new Error(`listLibrary: ${error.message}`);
  const all = (data ?? []) as unknown as CardRow[];
  const rows = onlyComplete(all, await firstUnitGapsFor(supabase, all));
  return withUnitCounts(supabase, rows, rows.map(toCard));
}

/**
 * The reader's enrolment status by workbook id on this tenant, for the Mine
 * and In progress chips. Ids and status only.
 */
export async function myEnrolmentStatuses(userId: string): Promise<Map<string, EnrolmentStatus>> {
  const supabase = await createUserClient();
  const tenantId = (await tenantIdForRequest()) ?? MARKETPLACE_TENANT_ID;
  const { data, error } = await supabase.from("enrolments").select("workbook_id, status").eq("user_id", userId).eq("tenant_id", tenantId).limit(500);
  if (error) throw new Error(`myEnrolmentStatuses: ${error.message}`);
  return new Map(((data ?? []) as { workbook_id: string; status: EnrolmentStatus }[]).map((r) => [r.workbook_id, r.status]));
}

/** One workbook by slug with its public listing and start sections, or null. */
export async function getWorkbookBySlug(slug: string): Promise<WorkbookDetail | null> {
  if (!SLUG.test(slug)) return null;
  const supabase = await createUserClient();
  const { data, error } = await supabase.from("workbooks").select(CARD_COLUMNS).eq("slug", slug).maybeSingle();
  if (error) throw new Error(`getWorkbookBySlug: ${error.message}`);
  if (!data) return null;
  const row = data as unknown as CardRow;
  const card = toCard(row);

  let listing: ListingBody | null = null;
  let start: StartBody | null = null;
  if (row.current_version_id) {
    const { data: sections, error: sErr } = await supabase
      .from("workbook_sections")
      .select("kind, body")
      .eq("version_id", row.current_version_id)
      .in("kind", ["listing", "start"]);
    if (sErr) throw new Error(`getWorkbookBySlug sections: ${sErr.message}`);
    for (const s of (sections ?? []) as { kind: string; body: unknown }[]) {
      if (s.kind === "listing") listing = s.body as ListingBody;
      if (s.kind === "start") start = s.body as StartBody;
    }
  }
  const unitCount = typeof listing?.structure?.count === "number" ? listing.structure.count : (demoUnitCounts().get(card.code) ?? null);
  return {
    card: { ...card, unitCount, unitKind: listing?.structure?.unit ?? (unitCount !== null ? "week" : null) },
    bookTitle: row.books?.title ?? null,
    bookLanguage: row.books?.language ?? null,
    listing,
    start,
    pricePointId: row.price_point_id,
    inMembership: row.in_membership !== false,
  };
}

/** Active shelves with their Themes for the filter chips. Topics are never selected. */
export async function listShelvesWithThemes(): Promise<ShelfWithThemes[]> {
  const supabase = await createUserClient();
  const { data, error } = await supabase.from("shelves").select("id, name, sort, themes(id, name, line, status)").eq("status", "active").order("sort");
  if (error) throw new Error(`listShelvesWithThemes: ${error.message}`);
  type Row = { id: string; name: string; sort: number; themes: { id: string; name: string; line: string | null; status?: string | null }[] };
  // A retired Theme (0025) never appears as a chip or heading.
  return ((data ?? []) as unknown as Row[]).map((s) => ({
    id: s.id,
    name: s.name,
    themes: (s.themes ?? [])
      .filter((t) => t.status !== "retired")
      .map((t) => ({ id: t.id, name: t.name, line: t.line }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

interface EnrolmentRow {
  id: string;
  workbook_id: string;
  version_id: string;
  status: string;
  started_at: string;
  last_opened_at: string;
  workbooks: {
    slug: string;
    title: string;
    short_title: string | null;
    badge: Badge;
    is_demo: boolean;
    safety_tier: SafetyTier;
  } | null;
}

/**
 * The reader's active enrolments as continue cards, most recently opened
 * first. Three queries, each on an indexed column: enrolments by user, the
 * listing and start sections for the pinned versions, and the unit_opened
 * events for those enrolments. Nothing here counts days.
 */
export async function myEnrolments(userId: string): Promise<ContinueCard[]> {
  const supabase = await createUserClient();
  const tenantId = (await tenantIdForRequest()) ?? MARKETPLACE_TENANT_ID;
  const { data, error } = await supabase
    .from("enrolments")
    .select("id, workbook_id, version_id, status, started_at, last_opened_at, workbooks(slug, title, short_title, badge, is_demo, safety_tier)")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .order("last_opened_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`myEnrolments: ${error.message}`);
  const rows = ((data ?? []) as unknown as EnrolmentRow[]).filter((r) => r.workbooks);
  if (rows.length === 0) return [];

  const versionIds = [...new Set(rows.map((r) => r.version_id))];
  const { data: sections } = await supabase
    .from("workbook_sections")
    .select("version_id, kind, structure:body->structure, daily:body->daily_check")
    .in("version_id", versionIds)
    .in("kind", ["listing", "start"]);
  type SectionRow = { version_id: string; kind: string; structure: ListingBody["structure"] | null; daily: unknown };
  const shape = new Map<string, { unit: ContinueCard["unitLabel"]; count: number | null; daily: boolean }>();
  for (const s of (sections ?? []) as unknown as SectionRow[]) {
    const cur = shape.get(s.version_id) ?? { unit: "unit" as const, count: null, daily: false };
    if (s.kind === "listing" && s.structure) {
      cur.unit = s.structure.unit ?? "unit";
      cur.count = typeof s.structure.count === "number" ? s.structure.count : null;
    }
    if (s.kind === "start") cur.daily = s.daily !== null && s.daily !== undefined;
    shape.set(s.version_id, cur);
  }

  const { data: opened } = await supabase
    .from("progress_events")
    .select("enrolment_id, ref")
    .in("enrolment_id", rows.map((r) => r.id))
    .eq("kind", "unit_opened");
  const highest = new Map<string, number>();
  for (const e of (opened ?? []) as { enrolment_id: string; ref: string | null }[]) {
    const n = Number.parseInt(e.ref ?? "", 10);
    if (!Number.isFinite(n)) continue;
    highest.set(e.enrolment_id, Math.max(highest.get(e.enrolment_id) ?? 0, n));
  }

  return rows.map((r) => {
    const s = shape.get(r.version_id) ?? { unit: "unit" as const, count: null, daily: false };
    const w = r.workbooks!;
    return {
      enrolmentId: r.id,
      workbookId: r.workbook_id,
      slug: w.slug,
      title: w.title,
      shortTitle: w.short_title,
      badge: w.badge,
      isDemo: w.is_demo,
      safetyTier: w.safety_tier,
      startedAt: r.started_at,
      lastOpenedAt: r.last_opened_at,
      unitLabel: s.unit,
      unitCount: s.count,
      currentUnit: highest.get(r.id) ?? null,
      hasDailyCheck: s.daily,
    };
  });
}
