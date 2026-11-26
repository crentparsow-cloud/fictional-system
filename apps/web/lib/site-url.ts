/**
 * The public origin of the marketplace, for metadataBase, canonical links,
 * the sitemap and robots.txt (F-011).
 *
 * NEXT_PUBLIC_SITE_URL wins when set (a full origin such as
 * https://akana.example). Otherwise AKANA_HOST, the host the marketplace
 * runs on, with https except on localhost. Then the Vercel system
 * address. Without any of these, localhost:3000.
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
  // On Vercel with neither set: the production address in production, the
  // branch or deployment address on previews.
  const vercel =
    env.VERCEL_ENV === "production"
      ? env.VERCEL_PROJECT_PRODUCTION_URL
      : env.VERCEL_BRANCH_URL || env.VERCEL_URL;
  const vhost = vercel?.trim();
  if (vhost && /^[a-z0-9.-]+$/i.test(vhost)) return `https://${vhost.toLowerCase()}`;
  return "http://localhost:3000";
}

/**
 * The origin for links that leave the request (review L2): links in emails,
 * return addresses given to Stripe, share and invite links, and redirects
 * built as full URLs. The value always comes from configuration and never
 * from the Host or X-Forwarded-Host header, which the caller of a request
 * controls. A link built from those headers could send a reader's sign-in
 * email to someone else's site.
 *
 * Two functions, one rule each:
 *
 *   linkOrigin        the one configured site address. For anything sent
 *                     with no visitor on the other end: scheduled emails,
 *                     webhooks, staff notices, calendar feeds.
 *   ownOrigin         for a visitor's own request (sign-in, checkout, share
 *                     links). If the request host is one of this
 *                     deployment's own addresses, taken from configuration,
 *                     that address is used, so a preview keeps its links on
 *                     the preview and the sign-in link opens on the host
 *                     that holds the sign-in cookie. The header only picks
 *                     between configured values. Any other host gets the
 *                     configured site address.
 *
 * One narrow exception keeps local work going on any port: when the
 * configured site address is itself a loopback address (AKANA_HOST is
 * localhost:3000 in .env.example) or nothing at all is configured, and the
 * request host is a loopback address, that address is used. A loopback host
 * can only ever point back at the person's own machine, and a deployment
 * with a real address configured never takes this path.
 *
 * A white-label host never sends mail or starts checkout: sign-in and
 * payment stay on the Akana apex (docs/TENANT_RESOLUTION.md).
 */
type HeaderBag = { get(name: string): string | null } | null | undefined;
const HOST = /^[a-z0-9.-]+(:\d{1,5})?$/;
const LOOPBACK = /^(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

function requestHost(headers: HeaderBag): string | null {
  const host = headers?.get("host")?.trim().toLowerCase();
  return host && HOST.test(host) ? host : null;
}

/** This deployment's own addresses, from configuration only. Host (with port) to origin. */
export function ownOrigins(env: Record<string, string | undefined> = process.env): Map<string, string> {
  const out = new Map<string, string>();
  const add = (origin: string) => {
    const u = safeUrl(origin);
    if (u && !out.has(u.host)) out.set(u.host, u.origin);
  };
  add(siteOrigin(env));
  const full = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (full) add(full);
  const host = env.AKANA_HOST?.trim().toLowerCase();
  if (host && HOST.test(host)) {
    const proto = LOOPBACK.test(host) ? "http" : "https";
    add(`${proto}://${host}`);
    // The proxy serves www in front of the apex as the marketplace too (lib/tenant.ts).
    if (!LOOPBACK.test(host)) add(`https://www.${host}`);
  }
  for (const v of [env.VERCEL_PROJECT_PRODUCTION_URL, env.VERCEL_BRANCH_URL, env.VERCEL_URL]) {
    const vhost = v?.trim().toLowerCase();
    if (vhost && /^[a-z0-9.-]+$/.test(vhost)) add(`https://${vhost}`);
  }
  return out;
}

export function linkOrigin(headers?: HeaderBag, env: Record<string, string | undefined> = process.env): string {
  const site = siteOrigin(env);
  if (LOOPBACK.test(site.replace(/^http:\/\//, ""))) {
    const host = requestHost(headers);
    if (host && LOOPBACK.test(host)) return `http://${host}`;
  }
  return site;
}

export function ownOrigin(headers?: HeaderBag, env: Record<string, string | undefined> = process.env): string {
  const host = requestHost(headers);
  const own = host ? ownOrigins(env).get(host) : undefined;
  return own ?? linkOrigin(headers, env);
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
