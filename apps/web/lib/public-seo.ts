/**
 * Structured data for the public listing pages (6.10, 2.11, 14.16): shelves,
 * Themes, collections and book club pages. Pure builders; the page serialises
 * them with ldString so "<" can never close the script tag.
 *
 * Only public facts go in: names, descriptions and links to public pages.
 * Never a price, an answer, a count of readers or a health claim.
 */
export interface LdItem {
  name: string;
  path: string;
}

type Ld = Record<string, unknown>;

export function absolute(origin: string, path: string): string {
  return `${origin.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

/** A listing page: a CollectionPage whose main entity is the list of programmes on it. */
export function collectionPageLd(input: { origin: string; path: string; name: string; description?: string | null; items: readonly LdItem[] }): Ld {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: input.name,
    url: absolute(input.origin, input.path),
    ...(input.description ? { description: input.description } : {}),
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: input.items.length,
      itemListElement: input.items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, url: absolute(input.origin, it.path) })),
    },
  };
}

/** Breadcrumb trail from the home page to this page. */
export function breadcrumbLd(origin: string, trail: readonly LdItem[]): Ld {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: absolute(origin, it.path) })),
  };
}

/** A Person for an author page. Display name, optional bio and own website only. */
export function personLd(input: { origin: string; path: string; name: string; bio?: string | null; website?: string | null }): Ld {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: input.name,
    url: absolute(input.origin, input.path),
    ...(input.bio ? { description: input.bio } : {}),
    ...(input.website && /^https:\/\//.test(input.website) ? { sameAs: [input.website] } : {}),
  };
}

/** JSON for a script tag. "<" is escaped so content can never close the tag. */
export function ldString(data: Ld | readonly Ld[]): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
