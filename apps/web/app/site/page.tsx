import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TenantShell } from "@/components/tenant/TenantShell";
import { TenantUnavailable } from "@/components/tenant/TenantUnavailable";
import { TenantWorkbookCard } from "@/components/tenant/TenantWorkbookCard";
import { getTenantSite, listTenantCatalogue, loadTenantSite, type TenantCard } from "@/lib/tenant-site";

/**
 * A tenant site's home (F-069, F-074). The proxy rewrites "/" on a
 * white-label host to here; on the marketplace /site is a 404. Shows the
 * tenant's chosen workbooks in its order, featured first, in its branding.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getTenantSite().catch(() => null);
  if (!site) return { title: "Not found" };
  return {
    title: { absolute: site.name },
    description: `Guided workbooks from ${site.name}.`,
    // Demo sites are never indexed.
    ...(site.isDemo ? { robots: { index: false, follow: false } } : {}),
    ...(site.brand.favicon ? { icons: { icon: site.brand.favicon } } : {}),
  };
}

export default async function TenantHome() {
  const site = await loadTenantSite();
  if (site === "not_found") notFound();
  if (site === "unavailable") return <TenantUnavailable />;
  let cards: TenantCard[] = [];
  try {
    cards = await listTenantCatalogue(site.id);
  } catch (err) {
    console.error("tenant_home_catalogue_failed", err instanceof Error ? err.message : "unknown");
  }
  const featured = cards.filter((c) => c.featured);
  const rest = cards.filter((c) => !c.featured);

  return (
    <TenantShell site={site}>
      <section className="tenant-hero">
        <h1>{site.name}</h1>
        <p>Guided workbooks built from our books. Work through them one small step at a time.</p>
      </section>

      {cards.length === 0 ? (
        <section className="empty-state">
          <h2>No workbooks yet</h2>
          <p>Workbooks will appear here when they are ready.</p>
        </section>
      ) : null}

      {featured.length ? (
        <section className="tenant-section" aria-labelledby="featured-h">
          <h2 id="featured-h">Featured</h2>
          <div className="tenant-grid">
            {featured.map((c) => (
              <TenantWorkbookCard key={c.workbookId} card={c} />
            ))}
          </div>
        </section>
      ) : null}

      {rest.length ? (
        <section className="tenant-section" aria-labelledby="all-h">
          <h2 id="all-h">{featured.length ? "More workbooks" : "Workbooks"}</h2>
          <div className="tenant-grid">
            {rest.map((c) => (
              <TenantWorkbookCard key={c.workbookId} card={c} />
            ))}
          </div>
        </section>
      ) : null}
    </TenantShell>
  );
}
