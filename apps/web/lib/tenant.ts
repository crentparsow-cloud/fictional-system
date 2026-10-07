/**
 * Tenant resolution from the request host: the config path.
 *
 * The marketplace is itself a tenant (slug "akana"). White-label sites are
 * subdomains of TENANT_APEX, a separate apex from the Akana domain so that
 * cookies never share scope (architecture 3.2). Localhost and Vercel preview
 * hosts resolve to the marketplace.
 *
 * This file has no Node or Next imports, so the proxy can use it on any
 * runtime. lib/tenant-resolve.ts layers the tenant_domains lookup on top and
 * falls back to this map when the database cannot be reached.
 * See docs/TENANT_RESOLUTION.md.
 */

export type TenantKind = "marketplace" | "white_label";

export interface ResolvedTenant {
  slug: string;
  kind: TenantKind;
}

/** Migration 0001 seeds the marketplace tenant with this fixed id. */
export const MARKETPLACE_TENANT_ID = "00000000-0000-0000-0000-00000000000a";

/**
 * The demo white-label tenant (F-074). Migration 0023 fixes its id; the row
 * is made by the demo reset (public.reset_demo_state). Its hosts come from
 * config, never from tenant_domains, so no domain is registered for it.
 */
export const DEMO_TENANT_ID = "00000000-0000-0000-0000-0000000000d1";
export const DEMO_TENANT_SLUG = "demo";

const AKANA_HOST = normaliseHost(process.env.AKANA_HOST ?? "");
const TENANT_APEX = normaliseHost(process.env.TENANT_APEX ?? "");

/**
 * Lower case, trimmed, no port, no trailing dot. IPv6 literals keep their
 * brackets. Anything that is not a plausible host name returns "" so it can
 * never reach a lookup.
 */
export function normaliseHost(rawHost: string): string {
  let host = rawHost.trim().toLowerCase();
  if (!host) return "";
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    if (end === -1) return "";
    host = host.slice(0, end + 1);
    return /^\[[0-9a-f:.]+\]$/.test(host) ? host : "";
  }
  host = host.split(":")[0] ?? "";
  while (host.endsWith(".")) host = host.slice(0, -1);
  if (!host || host.length > 253) return "";
  if (!/^[a-z0-9.-]+$/.test(host) || host.includes("..")) return "";
  return host;
}

/**
 * Hosts that serve the demo tenant from config: demo.localhost for local
 * work (browsers send *.localhost to this machine), plus each host in
 * DEMO_TENANT_HOSTS, a comma-separated list such as a Vercel alias
 * (akana-demo-site.vercel.app) pointed at a preview. demo.<TENANT_APEX>
 * resolves through the apex rule below. Checked before the preview rule, so
 * a listed *.vercel.app alias becomes the demo site, not the marketplace.
 */
export function demoTenantHosts(env: string | undefined = process.env.DEMO_TENANT_HOSTS): string[] {
  const listed = (env ?? "")
    .split(",")
    .map((h) => normaliseHost(h))
    .filter((h) => h && !h.startsWith("["));
  return ["demo.localhost", ...listed];
}

export function isDemoTenantHost(host: string): boolean {
  return Boolean(host) && demoTenantHosts().includes(host);
}

/** True for hosts that are always the marketplace: localhost and previews. */
export function isLocalOrPreviewHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".vercel.app");
}

/** True for the Akana apex and its www alias. */
export function isMarketplaceApex(host: string): boolean {
  return Boolean(AKANA_HOST) && (host === AKANA_HOST || host === `www.${AKANA_HOST}`);
}

export function resolveTenant(rawHost: string): ResolvedTenant | null {
  const host = normaliseHost(rawHost);
  if (!host) return null;

  if (isDemoTenantHost(host)) return { slug: DEMO_TENANT_SLUG, kind: "white_label" };
  if (isLocalOrPreviewHost(host) || isMarketplaceApex(host)) {
    return { slug: "akana", kind: "marketplace" };
  }
  if (TENANT_APEX && host.endsWith(`.${TENANT_APEX}`)) {
    const sub = host.slice(0, -(TENANT_APEX.length + 1));
    if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(sub) && sub !== "www") {
      return { slug: sub, kind: "white_label" };
    }
  }
  return null;
}
