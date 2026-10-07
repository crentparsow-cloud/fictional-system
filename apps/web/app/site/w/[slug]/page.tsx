import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Cover } from "@/components/Cover";
import { HelpNowButton } from "@/components/HelpNowButton";
import { TenantShell } from "@/components/tenant/TenantShell";
import { TenantUnavailable } from "@/components/tenant/TenantUnavailable";
import { getWorkbookBySlug } from "@/lib/catalogue";
import { BADGE_LABELS, unitWord } from "@/lib/catalogue-guard";
import { getTenantSite, loadTenantSite, tenantListing, type TenantSite } from "@/lib/tenant-site";
import { tenantPriceLine } from "@/lib/tenant-standards";

/**
 * A workbook page on a tenant site (F-069). The proxy rewrites /w/<slug> on
 * a white-label host to here. The workbook must be in this tenant's visible
 * catalogue (public.tenant_catalogue), so a tenant cannot show a title it
 * has not chosen or is not allowed to list. Same outline as the marketplace
 * page, in the tenant's branding, with the tenant's price line. Nothing is
 * sold here: there is no tenant checkout yet, and reading on tenant hosts
 * arrives with shared identity (F-133).
 */
export const dynamic = "force-dynamic";

type Params = { slug: string };

async function load(slug: string) {
  const site = await getTenantSite();
  if (!site) return null;
  return loadFor(site, slug);
}

async function loadFor(site: TenantSite, slug: string) {
  const card = await tenantListing(site.id, slug);
  if (!card) return null;
  const detail = await getWorkbookBySlug(slug);
  if (!detail) return null;
  return { site, card, detail };
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const page = await load(slug).catch(() => null);
  if (!page) return { title: "Not found" };
  const by = page.card.authors.length ? ` by ${page.card.authors.join(", ")}` : "";
  return {
    title: { absolute: `${page.card.title}${by} | ${page.site.name}` },
    description: page.card.cardLine,
    ...(page.site.isDemo || page.card.isDemo ? { robots: { index: false, follow: false } } : {}),
    ...(page.site.brand.favicon ? { icons: { icon: page.site.brand.favicon } } : {}),
  };
}

export default async function TenantWorkbookPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const loaded = await loadTenantSite();
  if (loaded === "not_found") notFound();
  if (loaded === "unavailable") return <TenantUnavailable />;
  let page: Awaited<ReturnType<typeof loadFor>>;
  try {
    page = await loadFor(loaded, slug);
  } catch (err) {
    console.error("tenant_workbook_unavailable", err instanceof Error ? err.message : "unknown");
    return <TenantUnavailable />;
  }
  if (!page) notFound();
  const { site, card, detail } = page;
  const unit = unitWord(detail);
  const outline = detail.listing?.outline ?? [];
  const count = detail.listing?.structure?.count ?? detail.card.unitCount;
  const wellbeing = card.safetyTier !== "none";

  return (
    <TenantShell site={site}>
      <p className="tenant-crumbs">
        <Link href="/">{site.name}</Link> <span aria-hidden="true">/</span> {card.title}
      </p>
      <article className="tenant-workbook">
        <header className="tenant-workbook-head">
          <Cover code={card.code} title={card.title} author={card.authors[0] ?? null} width={180} priority />
          <div>
            <span className={`badge${card.badge === "demo" ? " demo" : ""}`}>{BADGE_LABELS[card.badge]}</span>
            <h1>{card.title}</h1>
            {card.authors.length ? <p className="muted">By {card.authors.join(", ")}</p> : null}
            {card.cardLine ? <p className="wb-tagline">{card.cardLine}</p> : null}
            <p className="tenant-price">{tenantPriceLine(card)}</p>
            <div className="wb-actions">
              <span className="btn secondary is-disabled" aria-disabled="true">
                Reading on this site is coming soon
              </span>
              {wellbeing ? <HelpNowButton /> : null}
            </div>
          </div>
        </header>

        {card.isDemo ? <p className="demo-note">Demo workbook. The author and imprint are invented for testing. Nothing here is for sale.</p> : null}

        {count ? (
          <p>
            {count} {count === 1 ? unit.toLowerCase() : `${unit.toLowerCase()}s`}
            {detail.bookTitle ? (
              <>
                , built from <cite>{detail.bookTitle}</cite>
              </>
            ) : null}
            .
          </p>
        ) : null}

        {detail.start?.start?.welcome ? (
          <section className="wb-section">
            <h2>Who it is for</h2>
            <p>{detail.start.start.welcome}</p>
          </section>
        ) : null}

        <section className="wb-section">
          <h2>{outline.length ? `${unit} by ${unit.toLowerCase()}` : "Outline"}</h2>
          {outline.length ? (
            <ol className="wb-outline">
              {outline.map((u) => (
                <li key={u.number}>
                  <span className="wb-outline-n">
                    {unit} {u.number}
                  </span>
                  <span>{u.focus}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">The outline is being written. The line above says what the workbook covers.</p>
          )}
        </section>
      </article>
    </TenantShell>
  );
}
