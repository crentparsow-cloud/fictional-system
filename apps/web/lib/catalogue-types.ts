/**
 * Catalogue shapes shared by the server queries (lib/catalogue.ts), the pure
 * helpers and the tests. No Next.js or Supabase dependency here.
 */

export type Badge = "official" | "made_with_author" | "public_domain" | "demo";
export type SafetyTier = "none" | "standard" | "higher";
export type Depth = "listing" | "outline" | "first_unit" | "full";

/** One library card: title-first identity (F-003). */
export interface LibraryCard {
  id: string;
  code: string;
  slug: string;
  title: string;
  shortTitle: string | null;
  cardLine: string;
  genreId: string;
  genreName: string;
  themeId: string | null;
  themeName: string | null;
  badge: Badge;
  isDemo: boolean;
  depth: Depth;
  safetyTier: SafetyTier;
  /** Author display names in contributor order. Never a legal name. */
  authors: string[];
  /** False when the workbook has no published version yet: the card shows "Outline only". */
  hasVersion: boolean;
  /**
   * Filter facts (F-003). Optional so older fixtures still type check; the
   * library query always fills them.
   */
  /** Author slug and display name pairs in contributor order, for the author chips. */
  authorRefs?: { slug: string; name: string }[];
  /** The book's language tag, for example "en" or "en-GB". */
  language?: string;
  /** Number of units in the programme, or null when nothing says. */
  unitCount?: number | null;
}

/** Programme length buckets for the length chips: up to 4 units, 5 to 8, 9 or more. */
export type LengthBucket = "short" | "medium" | "long";

/** A reader's enrolment status by workbook id, for the Mine and In progress chips. */
export type EnrolmentStatus = "active" | "finished" | "paused";

/** The listing section body app.publish_version() writes, the parts the public page reads. */
export interface ListingBody {
  tagline?: string;
  language?: string;
  structure?: {
    unit?: "week" | "day" | "module" | "chapter";
    count?: number;
    free_units?: number;
    /** Not in the v3 schema today. Read if a later version adds it. */
    minutes_per_day?: number;
  };
  outline?: { number: number; stage?: string; focus: string }[];
  book?: { title?: string; subtitle?: string; store_links?: Record<string, string> };
  advice_guardrail?: string;
}

/** The start section body, the parts Home, Today and the public page read. */
export interface StartBody {
  start?: { welcome?: string; how_it_works?: string[] };
  daily_check?: { question: string } | null;
}

export interface WorkbookDetail {
  card: LibraryCard;
  bookTitle: string | null;
  bookLanguage: string | null;
  listing: ListingBody | null;
  start: StartBody | null;
  /** The ladder point the title is sold at, for the public page's Buy button (item 3.2). Null while unpriced. */
  pricePointId: string | null;
  /** Whether the membership covers this title (0009). */
  inMembership: boolean;
}

export interface ShelfWithThemes {
  id: string;
  name: string;
  themes: { id: string; name: string; line: string | null }[];
}

/** A continue card for Home and Today (F-016). Ids and timestamps only, no streaks. */
export interface ContinueCard {
  enrolmentId: string;
  workbookId: string;
  slug: string;
  title: string;
  shortTitle: string | null;
  badge: Badge;
  isDemo: boolean;
  safetyTier: SafetyTier;
  startedAt: string;
  lastOpenedAt: string;
  unitLabel: "week" | "day" | "module" | "chapter" | "unit";
  unitCount: number | null;
  /** The highest unit the reader has opened, or null before the first. */
  currentUnit: number | null;
  hasDailyCheck: boolean;
}
