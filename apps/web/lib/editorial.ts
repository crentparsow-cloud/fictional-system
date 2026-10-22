import type { LibraryCard } from "@/lib/catalogue-types";
import { cleanDay, dayWords, inWindow, ukToday } from "@/lib/seasonal";

/**
 * The weekly editorial slot (7.10): one staff-curated feature on Explore and
 * the public home page, with a start and an end date. Pure rules, so the
 * choice of slot and the wording of its dates are tested. The rows come from
 * public.editorial_slots (migration 0062), where RLS already limits a visitor
 * to a live slot inside its dates; the rules here repeat that for staff, who
 * can read every row.
 *
 * A slot features one title or one Theme. A title that is not visible to
 * readers (not live, first unit incomplete, other tenant) hides the slot
 * rather than showing a gap, and so does a Theme that is not shown.
 */

export interface EditorialSlotRow {
  id: string;
  heading: string;
  line: string;
  workbookId: string | null;
  themeId: string | null;
  startsOn: string;
  endsOn: string;
  status: "draft" | "live";
}

export type ResolvedSlot =
  | { id: string; heading: string; line: string; dates: string; kind: "workbook"; card: LibraryCard }
  | { id: string; heading: string; line: string; dates: string; kind: "theme"; theme: { id: string; name: string } };

/** The slot to show today: live, inside its dates; the latest start wins, then the latest id. */
export function pickActiveSlot(rows: readonly EditorialSlotRow[], now: Date = new Date()): EditorialSlotRow | null {
  const live = rows.filter((r) => r.status === "live" && inWindow(r.startsOn, r.endsOn, now));
  if (!live.length) return null;
  return [...live].sort((a, b) => (a.startsOn === b.startsOn ? (a.id < b.id ? 1 : -1) : a.startsOn < b.startsOn ? 1 : -1))[0] ?? null;
}

/** "19 to 25 October", "19 October to 2 November", "25 October". The year appears only when it is not this year. */
export function slotDates(startsOn: string, endsOn: string, now: Date = new Date()): string {
  const s = cleanDay(startsOn);
  const e = cleanDay(endsOn);
  if (!s || !e) return "";
  const year = ukToday(now).slice(0, 4);
  const withYear = s.slice(0, 4) !== year || e.slice(0, 4) !== year;
  if (s === e) return dayWords(s, withYear);
  if (!withYear && s.slice(0, 7) === e.slice(0, 7)) {
    const day = (d: string) => String(Number(d.slice(8, 10)));
    return `${day(s)} to ${dayWords(e, false)}`;
  }
  return `${dayWords(s, withYear)} to ${dayWords(e, withYear)}`;
}

/** The slot with its title or Theme found among what readers can see, or null when it cannot be shown. */
export function resolveSlot(
  row: EditorialSlotRow | null,
  cards: readonly LibraryCard[],
  themes: readonly { id: string; name: string }[],
  now: Date = new Date(),
): ResolvedSlot | null {
  if (!row) return null;
  const base = { id: row.id, heading: row.heading, line: row.line, dates: slotDates(row.startsOn, row.endsOn, now) };
  if (row.workbookId) {
    const card = cards.find((c) => c.id === row.workbookId);
    return card ? { ...base, kind: "workbook", card } : null;
  }
  if (row.themeId) {
    const theme = themes.find((t) => t.id === row.themeId);
    return theme ? { ...base, kind: "theme", theme: { id: theme.id, name: theme.name } } : null;
  }
  return null;
}
