/**
 * Tenant resolution from the request host.
 *
 * The marketplace is itself a tenant (slug "akana"). White-label sites are
 * subdomains of TENANT_APEX, a separate apex from the Akana domain so that
 * cookies never share scope (architecture 3.2). Localhost and Vercel preview
 * hosts resolve to the marketplace.
 */

export type TenantKind = "marketplace" | "white_label";

export interface ResolvedTenant {
  slug: string;
  kind: TenantKind;
}

const AKANA_HOST = (process.env.AKANA_HOST ?? "").toLowerCase();
const TENANT_APEX = (process.env.TENANT_APEX ?? "").toLowerCase();

export function resolveTenant(rawHost: string): ResolvedTenant | null {
  const host = rawHost.toLowerCase().split(":")[0] ?? "";
  if (!host) return null;

  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".vercel.app")) {
    return { slug: "akana", kind: "marketplace" };
  }
  if (AKANA_HOST && (host === AKANA_HOST.split(":")[0] || host === `www.${AKANA_HOST.split(":")[0]}`)) {
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
