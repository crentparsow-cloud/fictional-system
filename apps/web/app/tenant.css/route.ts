import { brandCss } from "@/lib/tenant-brand";
import { getTenantSite } from "@/lib/tenant-site";

/**
 * The tenant's brand as a stylesheet (F-067), linked from the tenant shell.
 *
 *   GET /tenant.css -> text/css
 *
 * Custom properties only, generated from the stored brand after it passes
 * the same validation the database enforces (lib/tenant-brand.ts). No inline
 * styles anywhere, so the CSP needs nothing new. On the marketplace, or for
 * an unknown or inactive tenant, it returns the header comment alone and the
 * house look stands. Cached briefly and privately: the answer depends on the
 * host.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  let site = null;
  try {
    site = await getTenantSite();
  } catch (err) {
    console.error("tenant_css_failed", err instanceof Error ? err.message : "unknown");
  }
  return new Response(brandCss(site?.brand ?? {}), {
    headers: {
      "Content-Type": "text/css; charset=utf-8",
      "Cache-Control": "private, max-age=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
