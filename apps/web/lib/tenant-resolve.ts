/**
 * Host to tenant resolution for the proxy (F-066, week 2).
 *
 * Two paths:
 *
 * - Config (default). lib/tenant.ts maps localhost, previews, the Akana apex
 *   and TENANT_APEX subdomains to a tenant. Only the marketplace has a known
 *   uuid on this path.
 * - Database (TENANT_DB_LOOKUP=1). public.resolve_tenant(p_host) from
 *   migration 0008: an exact match on a verified tenant_domains host,
 *   returning tenant_id, slug, kind and status, at most one row. Called
 *   through the Supabase REST RPC endpoint with the publishable key and a
 *   plain fetch, so it runs on any proxy runtime and never touches session
 *   cookies. anon still cannot list tenant_domains.
 *
 * The database path stays behind the flag so behaviour does not change until
 * it is switched on per deployment. docs/TENANT_RESOLUTION.md has the detail.
 *
 * Caching is in memory, per instance: 60 seconds for a hit, 30 seconds for a
 * miss or a fallback. No Node APIs, no next/* imports.
 */
import {
  DEMO_TENANT_ID,
  DEMO_TENANT_SLUG,
  MARKETPLACE_TENANT_ID,
  isDemoTenantHost,
  isLocalOrPreviewHost,
  isMarketplaceApex,
  normaliseHost,
  resolveTenant,
  type TenantKind,
} from "@/lib/tenant";

export interface HostTenant {
  /** The tenant uuid, or null when only the slug is known (config path). */
  id: string | null;
  slug: string;
  kind: TenantKind;
  /** Where the answer came from. "fallback" means the database failed. */
  source: "config" | "db" | "fallback";
}

export const POSITIVE_TTL_MS = 60_000;
export const NEGATIVE_TTL_MS = 30_000;
export const LOOKUP_TIMEOUT_MS = 1_500;
const MAX_ENTRIES = 1_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface CacheEntry {
  value: HostTenant | null;
  expires: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<HostTenant | null>>();

/** Test hook. Also safe to call after an admin changes a domain. */
export function clearTenantCache(): void {
  cache.clear();
  inflight.clear();
}

export interface ResolveDeps {
  fetchImpl?: typeof fetch;
  supabaseUrl?: string;
  publishableKey?: string;
}

/** The config map, with the fixed uuids filled in: the marketplace (0001) and the demo tenant (0023). */
export function resolveFromConfig(host: string, source: HostTenant["source"] = "config"): HostTenant | null {
  const t = resolveTenant(host);
  if (!t) return null;
  const id = t.kind === "marketplace" ? MARKETPLACE_TENANT_ID : t.slug === DEMO_TENANT_SLUG ? DEMO_TENANT_ID : null;
  return { id, slug: t.slug, kind: t.kind, source };
}

/**
 * Resolve a host through tenant_domains. Returns null for an unknown,
 * unverified or inactive host: the caller must answer 404. Never throws.
 */
export async function resolveTenantFromDb(rawHost: string, deps: ResolveDeps = {}): Promise<HostTenant | null> {
  const host = normaliseHost(rawHost);
  if (!host) return null;

  // The demo site's config hosts need no lookup either (F-074): no domain is registered for them.
  if (isDemoTenantHost(host)) {
    return { id: DEMO_TENANT_ID, slug: DEMO_TENANT_SLUG, kind: "white_label", source: "config" };
  }
  // The marketplace hosts need no lookup. Its id is fixed by migration 0001.
  if (isLocalOrPreviewHost(host) || isMarketplaceApex(host)) {
    return { id: MARKETPLACE_TENANT_ID, slug: "akana", kind: "marketplace", source: "config" };
  }

  const now = Date.now();
  const hit = cache.get(host);
  if (hit && hit.expires > now) return hit.value;
  if (hit) cache.delete(host);

  const pending = inflight.get(host);
  if (pending) return pending;

  const p = lookup(host, deps).finally(() => inflight.delete(host));
  inflight.set(host, p);
  return p;
}

async function lookup(host: string, deps: ResolveDeps): Promise<HostTenant | null> {
  const url = deps.supabaseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = deps.publishableKey ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const doFetch = deps.fetchImpl ?? fetch;

  if (!url || !key) return fallback(host, "Supabase is not configured");

  const endpoint = `${url.replace(/\/$/, "")}/rest/v1/rpc/resolve_tenant`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  let rows: unknown;
  try {
    const res = await doFetch(endpoint, {
      method: "POST",
      headers: { apikey: key, accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ p_host: host }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return fallback(host, `HTTP ${res.status}`);
    rows = await res.json();
  } catch (err) {
    const reason = controller.signal.aborted ? `timed out after ${LOOKUP_TIMEOUT_MS} ms` : String(err);
    return fallback(host, reason);
  } finally {
    clearTimeout(timer);
  }

  if (!Array.isArray(rows)) return fallback(host, "unexpected response shape");
  const tenant = parseRow(rows[0]);
  remember(host, tenant, tenant ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS);
  return tenant;
}

function parseRow(row: unknown): HostTenant | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.tenant_id !== "string" || !UUID.test(r.tenant_id)) return null;
  if (typeof r.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(r.slug)) return null;
  if (r.kind !== "marketplace" && r.kind !== "white_label") return null;
  // Suspended and closed tenants are not served.
  if (r.status !== "active") return null;
  return { id: r.tenant_id.toLowerCase(), slug: r.slug, kind: r.kind, source: "db" };
}

function fallback(host: string, reason: string): HostTenant | null {
  console.warn(`[tenant] database lookup failed for ${host} (${reason}); using the config map`);
  const value = resolveFromConfig(host, "fallback");
  // Held for the short TTL so an outage costs one slow request per host, not every request.
  remember(host, value, NEGATIVE_TTL_MS);
  return value;
}

function remember(host: string, value: HostTenant | null, ttl: number): void {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(host, { value, expires: Date.now() + ttl });
}

/** True when the database path is switched on for this deployment. */
export function dbLookupEnabled(): boolean {
  return process.env.TENANT_DB_LOOKUP === "1";
}

/** The proxy's entry point: config map by default, database behind the flag. */
export async function resolveRequestTenant(rawHost: string, deps: ResolveDeps = {}): Promise<HostTenant | null> {
  if (dbLookupEnabled()) return resolveTenantFromDb(rawHost, deps);
  return resolveFromConfig(normaliseHost(rawHost));
}

const STAFF_ONLY = /^\/(admin|studio|console|payouts|files|org)(\/|$)/;

/** Admin, studio, console, payouts (F-099), private files (F-135) and the organisation console (F-204) exist only on the Akana apex. */
export function isStaffOnlyPath(path: string): boolean {
  return STAFF_ONLY.test(path);
}

/**
 * The proxy's 404 rule. Unknown hosts never fall through to the marketplace,
 * and staff routes on a tenant host do not exist.
 */
export function routeDecision(tenant: HostTenant | null, path: string): "serve" | "not_found" {
  if (!tenant) return "not_found";
  if (isStaffOnlyPath(path) && tenant.kind !== "marketplace") return "not_found";
  return "serve";
}

/**
 * What a white-label host serves (F-068, F-069). A tenant site is the tenant
 * home and workbook pages, drawn by app/site in tenant branding, plus Akana's
 * locked pages, which the tenant cannot change: Help now, the offline help
 * page and the legal pages (privacy notice, reader terms). Everything else,
 * the marketplace's own pages included, is a 404 on a tenant host. Reading
 * and sign-in on tenant hosts wait for shared identity (F-133).
 *
 *   /            -> rewrite to /site
 *   /w/<slug>    -> rewrite to /site/w/<slug>
 *   locked pages -> served as they are, in Akana's own look
 *   anything else, /site itself included -> 404
 */
export type TenantSiteRoute = { action: "rewrite"; to: string } | { action: "serve" } | { action: "not_found" };

const TENANT_WORKBOOK = /^\/w\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/;
const TENANT_LOCKED = /^\/(help-now|help-offline|tenant\.css|api\/health)\/?$|^\/(legal|covers|brand)\/.+$/;

export function tenantSiteRoute(path: string): TenantSiteRoute {
  if (path === "/") return { action: "rewrite", to: "/site" };
  const w = TENANT_WORKBOOK.exec(path);
  if (w) return { action: "rewrite", to: `/site/w/${w[1]}` };
  if (TENANT_LOCKED.test(path)) return { action: "serve" };
  return { action: "not_found" };
}

/** /site is drawn only through the rewrite on a tenant host; on the marketplace it does not exist. */
export function isTenantSiteInternalPath(path: string): boolean {
  return /^\/site(\/|$)/.test(path);
}
