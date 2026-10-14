import type { LibraryCard } from "@/lib/catalogue-types";

/**
 * Three starter workbooks for a reader with nothing open (7.5). The first-run
 * screens show these instead of a sentence. Rules, in order:
 * - Only titles with a published version, so every card can be opened.
 * - Only safety tier none. A first-time reader is never handed a mental
 *   health title they did not choose.
 * - Different shelves where the catalogue allows, so the three differ.
 * - Shorter programmes first, then title, so the pick is stable.
 */
export function pickStarters(cards: readonly LibraryCard[], count = 3): LibraryCard[] {
  const pool = cards
    .filter((c) => c.hasVersion && c.safetyTier === "none")
    .sort((a, b) => (a.unitCount ?? 99) - (b.unitCount ?? 99) || a.title.localeCompare(b.title));
  const picked: LibraryCard[] = [];
  const shelves = new Set<string>();
  for (const c of pool) {
    if (picked.length >= count) break;
    if (shelves.has(c.genreId)) continue;
    shelves.add(c.genreId);
    picked.push(c);
  }
  for (const c of pool) {
    if (picked.length >= count) break;
    if (!picked.includes(c)) picked.push(c);
  }
  return picked;
}
