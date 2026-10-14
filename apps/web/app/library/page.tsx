import { permanentRedirect } from "next/navigation";

/**
 * The Library tab folded into Explore (14.1). Old links, bookmarks and the
 * filters they carried still work: the query string goes across, and a bare
 * /library opens the full list on Explore. Explore is public, so a signed-out
 * visitor is no longer sent to sign-in from here. This page sits outside the
 * (reader) route group on purpose: that group's layout sends a signed-out
 * visitor to sign-in before any page inside it runs.
 */
export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

export default async function LibraryRedirect({ searchParams }: { searchParams: Promise<Search> }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, v);
  }
  if (![...params.keys()].length) params.set("all", "1");
  permanentRedirect(`/explore?${params.toString()}#all`);
}
