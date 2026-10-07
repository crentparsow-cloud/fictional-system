import "server-only";
import { isSlug, type ThemeInput } from "@/lib/author-theme-pages";
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

type ThemeRow = { id: string; name: string; line: string | null; shelf_id: string | null; clearance_status: string; shelves: { name: string } | null };

const THEME_COLUMNS = "id, name, line, shelf_id, clearance_status, shelves(name)";

function toTheme(row: ThemeRow): ThemeInput {
  return { id: row.id, name: row.name, line: row.line, shelfId: row.shelf_id, shelfName: row.shelves?.name ?? null };
}

/** One Theme by id, or null. A Theme whose name failed clearance is never shown. */
export async function getTheme(slug: string): Promise<ThemeInput | null> {
  if (!isSlug(slug)) return null;
  const supabase = await createUserClient();
  const { data, error } = await supabase.from("themes").select(THEME_COLUMNS).eq("id", slug).maybeSingle();
  if (error) throw new Error(`getTheme: ${error.message}`);
  if (!data) return null;
  const row = data as unknown as ThemeRow;
  return row.clearance_status === "rejected" ? null : toTheme(row);
}

/** Every Theme that has not failed clearance, with its shelf name. */
export async function listThemes(): Promise<ThemeInput[]> {
  const supabase = await createUserClient();
  const { data, error } = await supabase.from("themes").select(THEME_COLUMNS).neq("clearance_status", "rejected").order("name").limit(500);
  if (error) throw new Error(`listThemes: ${error.message}`);
  return ((data ?? []) as unknown as ThemeRow[]).map(toTheme);
}
