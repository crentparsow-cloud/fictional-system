import "server-only";
import { isSlug, type ThemeInput } from "@/lib/author-theme-pages";
import { isRetiredStatus } from "@/lib/theme-visibility";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Reads for the author and Theme pages (F-006, F-007), over the user client so
 * RLS decides what a visitor sees. Columns are named: authors.legal_name has
 * no client grant and is never asked for, and themes.topics (the hidden search
 * terms) is never selected. Workbook cards come from listLibrary.
 */

export interface AuthorProfile {
  slug: string;
  name: string;
  bio: string | null;
  country: string | null;
  website: string | null;
  isDemo: boolean;
  isPublicDomain: boolean;
}

/** One public author by slug, or null. RLS only returns authors credited on a public workbook. */
export async function getAuthorBySlug(slug: string): Promise<AuthorProfile | null> {
  if (!isSlug(slug)) return null;
  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("authors")
    .select("slug, display_name, bio, country, website, is_demo, is_public_domain, status")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`getAuthorBySlug: ${error.message}`);
  if (!data) return null;
  const row = data as {
    slug: string;
    display_name: string;
    bio: string | null;
    country: string | null;
    website: string | null;
    is_demo: boolean;
    is_public_domain: boolean;
    status: string;
  };
  if (row.status !== "active") return null;
  return {
    slug: row.slug,
    name: row.display_name,
    bio: row.bio,
    country: row.country,
    website: row.website,
    isDemo: row.is_demo,
    isPublicDomain: row.is_public_domain,
  };
}

type ThemeRow = {
  id: string;
  name: string;
  line: string | null;
  shelf_id: string | null;
  clearance_status: string;
  min_books: number | null;
  hidden_until_min_books: boolean | null;
  status: string | null;
  shelves: { name: string; hidden_until_min_books: boolean | null } | null;
};

// hidden_until_min_books comes from migration 0015 (F-148); status from 0025.
const THEME_COLUMNS = "id, name, line, shelf_id, clearance_status, min_books, hidden_until_min_books, status, shelves(name, hidden_until_min_books)";

function toTheme(row: ThemeRow): ThemeInput {
  return {
    id: row.id,
    name: row.name,
    line: row.line,
    shelfId: row.shelf_id,
    shelfName: row.shelves?.name ?? null,
    held: row.hidden_until_min_books === true,
    minBooks: row.min_books,
    shelfHeld: row.shelves?.hidden_until_min_books === true,
    retired: isRetiredStatus(row.status),
  };
}

/** One Theme by id, or null. A Theme whose name failed clearance, or a retired Theme (0025), is never shown. */
export async function getTheme(slug: string): Promise<ThemeInput | null> {
  if (!isSlug(slug)) return null;
  const supabase = await createUserClient();
  const { data, error } = await supabase.from("themes").select(THEME_COLUMNS).eq("id", slug).maybeSingle();
  if (error) throw new Error(`getTheme: ${error.message}`);
  if (!data) return null;
  const row = data as unknown as ThemeRow;
  return row.clearance_status === "rejected" || isRetiredStatus(row.status) ? null : toTheme(row);
}

/**
 * Every Theme that has not failed clearance, with its shelf name. Retired
 * Themes are included, marked retired, so hiddenThemeIds can take their
 * label off any card that still names them; no page lists them.
 */
export async function listThemes(): Promise<ThemeInput[]> {
  const supabase = await createUserClient();
  const { data, error } = await supabase.from("themes").select(THEME_COLUMNS).neq("clearance_status", "rejected").order("name").limit(500);
  if (error) throw new Error(`listThemes: ${error.message}`);
  return ((data ?? []) as unknown as ThemeRow[]).map(toTheme);
}
