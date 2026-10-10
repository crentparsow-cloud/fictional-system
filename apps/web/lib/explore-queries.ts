import "server-only";
import type { EnrolmentStatus } from "@/lib/catalogue-types";
import type { ThemeInput } from "@/lib/author-theme-pages";
import { listThemes } from "@/lib/author-theme-queries";
import { listLibrary } from "@/lib/catalogue";
import { fetchCollectionBySlug, fetchLiveCollections } from "@/lib/collections-query";
import { resolveCollections, type MineRow, type ReadSeed, type ResolvedCollection, type ShelfRow, type Signals } from "@/lib/explore";
import { createUserClient } from "@/lib/supabase/server";
import { MARKETPLACE_TENANT_ID, tenantIdForRequest } from "@/lib/tenant-id";
import { hiddenThemeIds, maskHiddenThemes } from "@/lib/theme-visibility";
import type { LibraryCard } from "@/lib/catalogue-types";

/**
 * Reads for Explore, the shelf pages, collections and My workbooks. Every
 * read goes through the user client, so RLS decides what a visitor sees.
 * Cards come from listLibrary, which applies the first-unit rule (policy
 * 7.9); the Theme gate (F-148) is applied here once, so no page repeats it.
 */

export interface ExploreBase {
  /** Live cards that passed the first-unit rule, with any hidden Theme taken off. */
  cards: LibraryCard[];
  /** Theme id to shelf id, for Themes that are shown. */
  shelfOfTheme: Map<string, string>;
  /** Every Theme row, for themeIndex. Counts come from `cards`, which already carry the Theme gate. */
  themeRows: ThemeInput[];
  themes: { id: string; name: string; line: string | null; shelfId: string | null }[];
  shelves: ShelfRow[];
  signals: Signals;
}

export async function loadShelves(): Promise<ShelfRow[]> {
  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("shelves")
    .select("id, name, status, sort, hidden_until_min_books, editors_line, featured_workbook_id")
    .neq("status", "retired")
    .order("sort");
  if (error) throw new Error(`loadShelves: ${error.message}`);
  type R = { id: string; name: string; status: string; sort: number; hidden_until_min_books: boolean | null; editors_line: string | null; featured_workbook_id: string | null };
  return ((data ?? []) as unknown as R[]).map((s) => ({
    id: s.id,
    name: s.name,
    status: s.status,
    sort: s.sort,
    held: s.hidden_until_min_books === true,
    editorsLine: s.editors_line,
    featuredWorkbookId: s.featured_workbook_id,
  }));
}

/**
 * Starts and finishes per live workbook (public.explore_signals). A failed
 * read returns no signals: the rails fall back to title order and the page
 * still renders.
 */
export async function loadSignals(): Promise<Signals> {
  const supabase = await createUserClient();
  const tenantId = (await tenantIdForRequest()) ?? MARKETPLACE_TENANT_ID;
  const { data, error } = await supabase.rpc("explore_signals", { p_tenant: tenantId });
  if (error) {
    console.error("explore_signals_failed", error.code ?? "");
    return new Map();
  }
  const out = new Map<string, { starts: number; finishes: number }>();
  for (const r of (data ?? []) as { workbook_id: string; starts: number | string; finishes: number | string }[]) {
    out.set(r.workbook_id, { starts: Number(r.starts) || 0, finishes: Number(r.finishes) || 0 });
  }
  return out;
}

export async function loadExploreBase(): Promise<ExploreBase> {
  const [live, themeRows, shelves, signals] = await Promise.all([listLibrary({}), listThemes(), loadShelves(), loadSignals()]);
  const hidden = hiddenThemeIds(themeRows, live);
  const cards = maskHiddenThemes(live, hidden);
  const shown = themeRows.filter((t) => !hidden.has(t.id) && !t.retired && t.shelfId);
  const shelfOfTheme = new Map(shown.map((t) => [t.id, t.shelfId as string]));
  return {
    cards,
    shelfOfTheme,
    themeRows,
    themes: themeRows.filter((t) => !hidden.has(t.id) && !t.retired).map((t) => ({ id: t.id, name: t.name, line: t.line, shelfId: t.shelfId })),
    shelves,
    signals,
  };
}

/** Live collections resolved against the visible cards. */
export async function loadCollections(cards: readonly LibraryCard[]): Promise<ResolvedCollection[]> {
  const supabase = await createUserClient();
  return resolveCollections(await fetchLiveCollections(supabase), cards);
}

/** One collection by slug, resolved. Null when it is missing, not live or too thin to show. */
export async function loadCollection(slug: string, cards: readonly LibraryCard[]): Promise<ResolvedCollection | null> {
  const supabase = await createUserClient();
  const row = await fetchCollectionBySlug(supabase, slug);
  return row ? (resolveCollections([row], cards)[0] ?? null) : null;
}

/** The reader's enrolments as seeds for "Because you read X". Ids, status and time only. */
export async function loadReadSeeds(userId: string): Promise<ReadSeed[]> {
  const supabase = await createUserClient();
  const tenantId = (await tenantIdForRequest()) ?? MARKETPLACE_TENANT_ID;
  const { data, error } = await supabase
    .from("enrolments")
    .select("workbook_id, status, last_opened_at")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .limit(200);
  if (error) throw new Error(`loadReadSeeds: ${error.message}`);
  return ((data ?? []) as { workbook_id: string; status: EnrolmentStatus; last_opened_at: string }[]).map((r) => ({
    workbookId: r.workbook_id,
    status: r.status,
    lastOpenedAt: r.last_opened_at,
  }));
}

/**
 * The reader's shelf: every enrolment on this tenant, in any status. These are
 * the reader's own titles, so they stay even when a title has since gone off
 * the public lists (paused, or a first unit under repair). Nothing here counts
 * days or streaks.
 */
export async function myWorkbooks(userId: string): Promise<MineRow[]> {
  const supabase = await createUserClient();
  const tenantId = (await tenantIdForRequest()) ?? MARKETPLACE_TENANT_ID;
  const { data, error } = await supabase
    .from("enrolments")
    .select(
      "id, workbook_id, version_id, status, started_at, last_opened_at, workbooks(slug, code, title, short_title, badge, is_demo, safety_tier, books(book_contributors(role, sort, authors(display_name))))",
    )
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .order("last_opened_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`myWorkbooks: ${error.message}`);
  type W = {
    slug: string;
    code: string;
    title: string;
    short_title: string | null;
    badge: MineRow["badge"];
    is_demo: boolean;
    safety_tier: MineRow["safetyTier"];
    books: { book_contributors: { role: string; sort: number; authors: { display_name: string } | null }[] } | null;
  };
  type R = { id: string; workbook_id: string; version_id: string; status: EnrolmentStatus; started_at: string; last_opened_at: string; workbooks: W | null };
  const rows = ((data ?? []) as unknown as R[]).filter((r) => r.workbooks);

  const versionIds = [...new Set(rows.map((r) => r.version_id))];
  const lengths = new Map<string, { count: number | null; unit: MineRow["unitKind"] }>();
  if (versionIds.length) {
    const { data: sections } = await supabase
      .from("workbook_sections")
      .select("version_id, count:body->structure->count, unit:body->structure->unit")
      .eq("kind", "listing")
      .in("version_id", versionIds);
    for (const s of (sections ?? []) as unknown as { version_id: string; count: unknown; unit: unknown }[]) {
      lengths.set(s.version_id, {
        count: typeof s.count === "number" && Number.isFinite(s.count) ? s.count : null,
        unit: s.unit === "week" || s.unit === "day" || s.unit === "module" || s.unit === "chapter" ? s.unit : null,
      });
    }
  }

  return rows.map((r) => {
    const w = r.workbooks!;
    const len = lengths.get(r.version_id);
    return {
      enrolmentId: r.id,
      workbookId: r.workbook_id,
      slug: w.slug,
      code: w.code,
      title: w.title,
      shortTitle: w.short_title,
      badge: w.badge,
      isDemo: w.is_demo,
      safetyTier: w.safety_tier,
      status: r.status,
      startedAt: r.started_at,
      lastOpenedAt: r.last_opened_at,
      unitCount: len?.count ?? null,
      unitKind: len?.unit ?? (len?.count != null ? "week" : null),
      authors: (w.books?.book_contributors ?? [])
        .filter((c) => c.role === "author" && c.authors?.display_name)
        .sort((a, b) => a.sort - b.sort)
        .map((c) => c.authors!.display_name),
    };
  });
}
