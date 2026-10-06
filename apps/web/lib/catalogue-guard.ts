import type { WorkbookDetail } from "@/lib/catalogue-types";

/**
 * The public workbook page (F-005) in text form, and the guard that keeps
 * hidden Theme topics out of it.
 *
 * themes.topics are search terms a reader never sees. The page builds its
 * metadata and JSON-LD through the functions here, and the test renders the
 * same text for a fixture and fails if any topic string appears. There is no
 * database in tests, so the guard is a pure function over a WorkbookDetail.
 */

export const BADGE_LABELS: Record<WorkbookDetail["card"]["badge"], string> = {
  official: "Official",
  made_with_author: "Made with the author",
  public_domain: "Public domain classic",
  demo: "Demo",
};

export const UNIT_WORDS: Record<"week" | "day" | "module" | "chapter", string> = {
  week: "Week",
  day: "Day",
  module: "Module",
  chapter: "Chapter",
};

export function unitWord(detail: WorkbookDetail): string {
  const u = detail.listing?.structure?.unit;
  return u ? UNIT_WORDS[u] : "Unit";
}

/** Page title and description. The description is the card line and nothing else. */
export function workbookMeta(detail: WorkbookDetail): { title: string; description: string } {
  const { card } = detail;
  const by = card.authors.length ? ` by ${card.authors.join(", ")}` : "";
  return { title: `${card.title}${by}`, description: card.cardLine };
}

/**
 * schema.org Book and Product. No health claims, no price, no offers yet:
 * commerce decides price and the Offer arrives with it. Author is a Person
 * by display name only.
 */
export function workbookJsonLd(detail: WorkbookDetail): Record<string, unknown>[] {
  const { card } = detail;
  const authors = card.authors.map((name) => ({ "@type": "Person", name }));
  const language = detail.listing?.language ?? detail.bookLanguage ?? undefined;
  const out: Record<string, unknown>[] = [];
  if (detail.bookTitle) {
    out.push({
      "@context": "https://schema.org",
      "@type": "Book",
      name: detail.bookTitle,
      ...(authors.length ? { author: authors.length === 1 ? authors[0] : authors } : {}),
      ...(language ? { inLanguage: language } : {}),
    });
  }
  out.push({
    "@context": "https://schema.org",
    "@type": "Product",
    name: card.title,
    description: card.cardLine,
    sku: card.code,
    category: card.genreName,
    ...(detail.bookTitle ? { isBasedOn: { "@type": "Book", name: detail.bookTitle } } : {}),
    ...(card.isDemo ? { additionalProperty: { "@type": "PropertyValue", name: "Demo", value: "true" } } : {}),
  });
  return out;
}

/** JSON-LD serialised for a script tag. "<" is escaped so content can never close the tag. */
export function jsonLdString(detail: WorkbookDetail): string {
  return JSON.stringify(workbookJsonLd(detail)).replace(/</g, "\\u003c");
}

/**
 * Every string the public page puts on screen or in the head, joined with
 * newlines. The page renders from the same fields, so this is what the guard
 * checks. Keep it in step when the page gains a field.
 */
export function workbookPageText(detail: WorkbookDetail): string {
  const { card, listing, start } = detail;
  const meta = workbookMeta(detail);
  const parts: (string | null | undefined)[] = [
    meta.title,
    meta.description,
    card.title,
    card.shortTitle,
    card.code,
    BADGE_LABELS[card.badge],
    card.cardLine,
    card.genreName,
    card.themeName,
    ...card.authors,
    detail.bookTitle,
    listing?.tagline,
    listing?.language ?? detail.bookLanguage,
    start?.start?.welcome,
    ...(start?.start?.how_it_works ?? []),
    ...(listing?.outline ?? []).map((u) => `${unitWord(detail)} ${u.number}: ${u.focus}`),
    listing?.structure ? `${listing.structure.count} ${listing.structure.unit}s` : null,
    listing?.structure?.minutes_per_day ? `${listing.structure.minutes_per_day} minutes a day` : null,
    jsonLdString(detail),
  ];
  return parts.filter((p): p is string => typeof p === "string" && p.length > 0).join("\n");
}

/**
 * Returns the topic strings that appear in the text, case-insensitively and
 * on word boundaries. An empty array means the page is clean.
 */
export function findTopicLeaks(text: string, topics: readonly string[]): string[] {
  const lower = text.toLowerCase();
  const leaks: string[] = [];
  for (const topic of topics) {
    const t = topic.trim().toLowerCase();
    if (!t) continue;
    const re = new RegExp(`(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i");
    if (re.test(lower)) leaks.push(topic);
  }
  return leaks;
}

/** The guard the page test runs: clean text for the fixture, or the list of leaks. */
export function guardWorkbookPage(detail: WorkbookDetail, topics: readonly string[]): string[] {
  return findTopicLeaks(workbookPageText(detail), topics);
}
