import type { Metadata } from "next";

/**
 * Whether public pages ask search engines to index them (6.10, 2.11).
 *
 * The root layout keeps the whole site out of search until launch. A public
 * page (programme, shelf, Theme, collection, author, book club, newsletter,
 * minister page) opts back in through publicRobots(), but only when
 * SEARCH_INDEXING is "on". While it is blank or anything else, every page
 * stays noindex, so the switch is one environment variable and not a code
 * change. Demo titles are never indexed, whatever the switch says.
 */
export function indexingOn(env: Record<string, string | undefined> = process.env): boolean {
  return env.SEARCH_INDEXING?.trim().toLowerCase() === "on";
}

export function publicRobots(opts: { isDemo?: boolean } = {}, env?: Record<string, string | undefined>): NonNullable<Metadata["robots"]> {
  return indexingOn(env) && !opts.isDemo ? { index: true, follow: true } : { index: false, follow: false };
}
