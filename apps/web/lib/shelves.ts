/**
 * Shelf colour, icon and line, in one file (plan 1.3).
 *
 * The icon and the line key are set here. The colours are not written here:
 * each shelf points at the tokens --shelf-<id>-t (tile) and --shelf-<id>-i
 * (icon and rule), and the values live in the theme files, one set per
 * direction and per colour scheme (lib/design/directions.ts). That is how
 * "per-direction overrides" work: a direction supplies its own pair for every
 * shelf. lib/design/design.test.ts checks every pair for contrast against its
 * tile and against the canvas (WCAG AA: 4.5 to 1 for text, 3 to 1 for icons).
 *
 * The tile, the shelf page header and the collection cover read
 * --shelf-tint and --shelf-accent, which the components set from this file.
 * Keyed by shelves.id (migration 0015 lists the ten). A shelf added later
 * falls back to FALLBACK_SHELF_STYLE until it is given a row here.
 */
import { SHELF_IDS, type ShelfId } from "@/lib/design/directions";

export type ShelfIcon = "mind" | "work" | "money" | "family" | "heart" | "growth" | "learn" | "body" | "spirit" | "make";

export interface ShelfStyle {
  /** Tile background, as a CSS token reference. */
  tint: string;
  /** Icon and rule colour, as a CSS token reference. */
  accent: string;
  icon: ShelfIcon;
  /** Key of the short line in messages/en-GB.json. */
  lineKey: string;
}

const ICONS: Record<ShelfId, ShelfIcon> = {
  "mind-and-mood": "mind",
  "work-and-career": "work",
  money: "money",
  "family-and-parenting": "family",
  "love-and-relationships": "heart",
  "personal-growth": "growth",
  "learning-and-skills": "learn",
  "health-and-body": "body",
  "faith-and-spirituality": "spirit",
  "creativity-and-making": "make",
};

export const SHELF_STYLES: Record<string, ShelfStyle> = Object.fromEntries(
  SHELF_IDS.map((id) => [id, { tint: `var(--shelf-${id}-t)`, accent: `var(--shelf-${id}-i)`, icon: ICONS[id], lineKey: `shelf.line.${id}` }]),
);

export const FALLBACK_SHELF_STYLE: ShelfStyle = { tint: "var(--surface-2)", accent: "var(--ink-soft)", icon: "growth", lineKey: "" };

export function shelfStyle(shelfId: string | null | undefined): ShelfStyle {
  return (shelfId && Object.hasOwn(SHELF_STYLES, shelfId) ? SHELF_STYLES[shelfId] : undefined) ?? FALLBACK_SHELF_STYLE;
}

/**
 * Simple 24 x 24 stroke icons, one path set per ShelfIcon. The component
 * draws them with currentColor, so the accent above decides the colour.
 */
export const SHELF_ICON_PATHS: Record<ShelfIcon, string[]> = {
  mind: ["M12 4a5 5 0 0 0-5 5c0 2 1 3 1 5h8c0-2 1-3 1-5a5 5 0 0 0-5-5Z", "M9.5 18h5", "M10.5 20.5h3"],
  work: ["M4 8h16v11H4Z", "M9 8V5.5h6V8", "M4 13h16"],
  money: ["M12 3.5v17", "M16 7.5c0-1.4-1.8-2.5-4-2.5s-4 1.1-4 2.5 1.8 2.3 4 2.8 4 1.3 4 2.7-1.8 2.5-4 2.5-4-1.1-4-2.5"],
  family: ["M4 11.5 12 5l8 6.5", "M6 10.5V19h12v-8.5", "M10 19v-4.5h4V19"],
  heart: ["M12 19.5s-7-4.3-7-9.2A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.3c0 4.9-7 9.2-7 9.2Z"],
  growth: ["M12 20v-8", "M12 12c0-3.5-2.5-5.5-6-5.5 0 3.5 2.5 5.5 6 5.5Z", "M12 14c0-3 2.2-5 5.5-5 0 3-2.2 5-5.5 5Z"],
  learn: ["M3 9.5 12 5l9 4.5-9 4.5Z", "M7 12v4.5c1.2 1.2 3 2 5 2s3.8-.8 5-2V12"],
  body: ["M12 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z", "M12 8v6", "M7 10.5l5-2.5 5 2.5", "M9 20l3-6 3 6"],
  spirit: ["M12 4c1.5 3.5 4.5 5 4.5 8.5a4.5 4.5 0 0 1-9 0C7.5 9 10.5 7.5 12 4Z", "M12 21v-3"],
  make: ["M4 20l1-4 10-10 3 3-10 10Z", "M13.5 7.5l3 3"],
};
