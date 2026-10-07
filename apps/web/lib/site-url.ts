/**
 * The public origin of the marketplace, for metadataBase, canonical links,
 * the sitemap and robots.txt (F-011).
 *
 * NEXT_PUBLIC_SITE_URL wins when set (a full origin such as
 * https://akana.example). Otherwise AKANA_HOST, the host the marketplace
 * runs on, with https except on localhost. Without either, localhost:3000.
 * Anything that does not parse falls back rather than throwing, so a bad
 * value never takes the site down; it only gives wrong canonicals.
 */
export function siteOrigin(env: Record<string, string | undefined> = process.env): string {
  const full = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (full) {
    const parsed = safeUrl(full);
    if (parsed) return parsed.origin;
  }
  const host = env.AKANA_HOST?.trim();
  if (host && /^[a-z0-9.-]+(:\d{1,5})?$/i.test(host)) {
    const proto = /^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https";
    return `${proto}://${host.toLowerCase()}`;
  }
  return "http://localhost:3000";
}

/** The origin as a URL, for Next's metadataBase. */
export function siteUrl(env?: Record<string, string | undefined>): URL {
  return new URL(siteOrigin(env));
}

/** An absolute URL on the site for a path that starts with "/". */
export function absoluteUrl(path: string, origin: string = siteOrigin()): string {
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

function safeUrl(value: string): URL | null {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:" ? u : null;
  } catch {
    return null;
  }
}
