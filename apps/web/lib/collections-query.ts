import type { createUserClient } from "@/lib/supabase/server";
import type { CollectionRow } from "@/lib/explore";

/**
 * The collections read (build list 2.3). No server-only import, so the test
 * can hand it a stub client. RLS (migration 0043) already limits a visitor to
 * live collections and their items; the status filter here keeps staff, who
 * can read drafts, from seeing a draft on a public page.
 *
 * Titles come back as ids in staff order. The page resolves them to cards
 * through resolveCollections, so a title that is not live or whose first unit
 * is incomplete drops out there.
 */
type Db = Awaited<ReturnType<typeof createUserClient>>;

const COLUMNS = "id, slug, name, line, cover_genre, cover_pattern, sort, collection_items(workbook_id, position)";

interface Row {
  id: string;
  slug: string;
  name: string;
  line: string;
  cover_genre: string;
  cover_pattern: string | null;
  sort: number;
  collection_items: { workbook_id: string; position: number }[] | null;
}

function toRow(r: Row): CollectionRow {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    line: r.line,
    coverGenre: r.cover_genre,
    coverPattern: r.cover_pattern,
    sort: r.sort,
    items: (r.collection_items ?? []).map((i) => ({ workbookId: i.workbook_id, position: i.position })),
  };
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Every live collection with its title ids in order. */
export async function fetchLiveCollections(db: Db): Promise<CollectionRow[]> {
  const { data, error } = await db.from("collections").select(COLUMNS).eq("status", "live").order("sort").order("name").limit(100);
  if (error) throw new Error(`fetchLiveCollections: ${error.message}`);
  return ((data ?? []) as unknown as Row[]).map(toRow);
}

/** One live collection by slug, or null. */
export async function fetchCollectionBySlug(db: Db, slug: string): Promise<CollectionRow | null> {
  if (!SLUG.test(slug)) return null;
  const { data, error } = await db.from("collections").select(COLUMNS).eq("slug", slug).eq("status", "live").maybeSingle();
  if (error) throw new Error(`fetchCollectionBySlug: ${error.message}`);
  return data ? toRow(data as unknown as Row) : null;
}
