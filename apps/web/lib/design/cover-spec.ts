/**
 * The cover system's rules, pure (plan 1.2, 1.9). A cover says three things
 * at a glance without words: how long the programme is (one, two or three
 * bars, or a collection or Start here mark), which shelf it sits on (colour),
 * and what it is for (one line of preview). The renderer is
 * lib/design/cover-render.tsx; the direction's cover style (corner radius,
 * frame, motif) is in lib/design/directions.ts.
 */
import { SHELF_IDS, type ShelfId } from "./directions";

export type CoverFormat = "w4" | "w8" | "w12" | "collection" | "start";
export const COVER_FORMATS: readonly CoverFormat[] = ["w4", "w8", "w12", "collection", "start"];

export interface CoverSpec {
  format: CoverFormat;
  /** Words next to the mark: "12 weeks", "Collection", "Start here". */
  label: string;
  title: string;
  author: string;
  /** One line, already shortened. */
  preview: string;
  shelfId: ShelfId;
}

export interface FormatInput {
  unitCount?: number | null;
  unitKind?: "week" | "day" | "module" | "chapter" | "part" | null;
  collection?: boolean;
  start?: boolean;
}

/** Bars drawn for a programme: up to 5 units one, 6 to 9 two, 10 or more three (so 4, 8 and 12 weeks read 1, 2, 3). */
export function barsFor(count: number): 1 | 2 | 3 {
  return count <= 5 ? 1 : count <= 9 ? 2 : 3;
}

export function coverFormat(i: FormatInput): CoverFormat {
  if (i.start) return "start";
  if (i.collection) return "collection";
  const n = i.unitCount ?? 0;
  if (n <= 0) return "w4";
  return (["w4", "w8", "w12"] as const)[barsFor(n) - 1]!;
}

const UNIT_WORD = { week: "week", day: "day", module: "module", chapter: "chapter", part: "part" } as const;

export function formatLabel(i: FormatInput): string {
  if (i.start) return "Start here";
  if (i.collection) return "Collection";
  const n = i.unitCount ?? 0;
  if (n <= 0) return "Workbook";
  const w = UNIT_WORD[i.unitKind ?? "week"];
  return `${n} ${w}${n === 1 ? "" : "s"}`;
}

export const BAR_COUNT: Record<CoverFormat, number> = { w4: 1, w8: 2, w12: 3, collection: 0, start: 0 };

/** The card line cut to one short line on a word boundary. Never invents text. */
export function previewLine(text: string | null | undefined, max = 46): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.5 ? cut.slice(0, at) : cut).replace(/[\s.,;:-]+$/, "")}…`;
}

/** Genre to shelf, for titles whose Theme (and so shelf) is not at hand. */
const GENRE_SHELF: Record<string, ShelfId> = {
  wellbeing: "mind-and-mood",
  personal_development: "personal-growth",
  relationships: "love-and-relationships",
  parenting: "family-and-parenting",
  career: "work-and-career",
  leadership: "work-and-career",
  business: "work-and-career",
  productivity: "personal-growth",
  finance: "money",
  education: "learning-and-skills",
  life_skills: "learning-and-skills",
};

export function shelfForCover(shelfId: string | null | undefined, genreId: string | null | undefined): ShelfId {
  if (shelfId && (SHELF_IDS as readonly string[]).includes(shelfId)) return shelfId as ShelfId;
  return (genreId && Object.hasOwn(GENRE_SHELF, genreId) ? GENRE_SHELF[genreId] : undefined) ?? "personal-growth";
}

/** Title lines for the cover: at most three, each at most 13 characters wide at the cover's type size. */
export function titleLines(title: string, maxChars = 13, maxLines = 3): { lines: string[]; truncated: boolean } {
  const words = title.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if (!line) line = w;
    else if (line.length + 1 + w.length <= maxChars) line += ` ${w}`;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return { lines, truncated: false };
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${kept[maxLines - 1]!.replace(/[\s.,;:-]+$/, "")}…`;
  return { lines: kept, truncated: true };
}

/** The cover's own units (3:4) and the width used when none is asked for. */
export const COVER_UNITS = { w: 120, h: 160, defaultWidth: 240 } as const;

/** Cached widths for the portrait cover route (10.2). Same short list as the app's Cover component. */
export const COVER_PNG_WIDTHS = [120, 240, 360, 480] as const;
export function snapPngWidth(w: number): (typeof COVER_PNG_WIDTHS)[number] {
  return COVER_PNG_WIDTHS.find((s) => s >= w) ?? COVER_PNG_WIDTHS[COVER_PNG_WIDTHS.length - 1]!;
}
