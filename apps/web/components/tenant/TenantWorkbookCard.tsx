import Link from "next/link";
import { Cover } from "@/components/Cover";
import { BADGE_LABELS } from "@/lib/catalogue-guard";
import type { TenantCard } from "@/lib/tenant-site";
import { tenantPriceLine } from "@/lib/tenant-standards";

/**
 * A workbook card on a tenant site (F-069). Title first, author names, the
 * badge (Demo on every demo title), the card line and the tenant's price
 * line. No links to marketplace author or Theme pages, which do not exist on
 * a tenant host.
 */
export function TenantWorkbookCard({ card }: { card: TenantCard }) {
  return (
    <article className="card wb-card tenant-card">
      <Cover code={card.code} title={card.title} author={card.authors[0] ?? null} width={120} className="tenant-card-cover" />
      <div className="tenant-card-body">
        <div className="wb-card-top">
          <span className={`badge${card.badge === "demo" ? " demo" : ""}`}>{BADGE_LABELS[card.badge]}</span>
          {card.genreName ? <span className="chip">{card.genreName}</span> : null}
        </div>
        <h3 className="wb-card-title">
          <Link href={`/w/${card.slug}`}>{card.title}</Link>
        </h3>
        {card.authors.length ? <p className="wb-card-author muted">{card.authors.join(", ")}</p> : null}
        {card.cardLine ? <p className="wb-card-line">{card.cardLine}</p> : null}
        <p className="muted small">{tenantPriceLine(card)}</p>
      </div>
    </article>
  );
}
