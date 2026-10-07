import "server-only";
import type { LibraryCard } from "@/lib/catalogue-types";
import { cleanTopics, entryFromCard, type SearchEntry } from "@/lib/search";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Builds the search index entries (F-008) for cards the page has already
 * read. One extra query adds the two things the cards do not carry: the
 * book's publisher and the Theme's hidden topic terms.
 *
 * Topics are read here and nowhere else. They go to the browser only inside
 * the search index and are never displayed (the cards and the result list do
 * not render them). This is the on-device form of the search vector in the
 * architecture note (section 11): the index ships with the page, so the
 * query never has to leave the device.
 *
 * Any failure falls back to the cards alone, so search still works on
 * titles, authors, Themes and codes.
 */
export async function searchEntriesFor(cards: readonly LibraryCard[]): Promise<SearchEntry[]> {
  const ids = cards.map((c) => c.id);
  const extras = new Map<string, { topics: string[]; publisher: string | null }>();
  if (ids.length) {
    try {
      const supabase = await createUserClient();
      const { data, error } = await supabase.from("workbooks").select("id, themes(topics), books(publisher)").in("id", ids).limit(ids.length);
      if (!error) {
        type Row = { id: string; themes: { topics: string[] | null } | null; books: { publisher: string | null } | null };
        for (const row of (data ?? []) as unknown as Row[]) {
          extras.set(row.id, { topics: cleanTopics(row.themes?.topics), publisher: row.books?.publisher ?? null });
        }
      }
    } catch {
      // Fall back to the cards alone.
    }
  }
  return cards.map((c) => entryFromCard(c, extras.get(c.id)));
}
