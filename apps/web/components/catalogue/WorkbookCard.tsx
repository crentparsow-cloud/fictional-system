import Link from "next/link";
import type { LibraryCard } from "@/lib/catalogue-types";
import { BADGE_LABELS } from "@/lib/catalogue-guard";

/**
 * A library card with title-first identity (F-003): book title, author
 * display name, Theme chip, card line, badge. Demo content is labelled on
 * every surface (F-004). A workbook with no published version shows
 * "Outline only" and has no open button. The Theme chip and author names
 * link to their pages (F-006, F-007).
 */
export function WorkbookCard({ card, outlineOnlyLabel, openLabel }: { card: LibraryCard; outlineOnlyLabel: string; openLabel: string }) {
  return (
    <article className="card wb-card">
      <div className="wb-card-top">
        <span className={`badge${card.badge === "demo" ? " demo" : ""}`}>{BADGE_LABELS[card.badge]}</span>
        {card.themeName && card.themeId ? (
          <Link className="chip" href={`/themes/${card.themeId}`}>
            {card.themeName}
          </Link>
        ) : card.themeName ? (
          <span className="chip">{card.themeName}</span>
        ) : null}
      </div>
      <h3 className="wb-card-title">
        <Link href={`/w/${card.slug}`}>{card.title}</Link>
      </h3>
      {card.authorRefs?.length ? (
        <p className="wb-card-author muted">
          {card.authorRefs.map((a, i) => (
            <span key={a.slug}>
              {i > 0 ? ", " : null}
              <Link className="author-link" href={`/authors/${a.slug}`}>
                {a.name}
              </Link>
            </span>
          ))}
        </p>
      ) : card.authors.length ? (
        <p className="wb-card-author muted">{card.authors.join(", ")}</p>
      ) : null}
      {card.cardLine ? <p className="wb-card-line">{card.cardLine}</p> : null}
      <div className="wb-card-foot">
        <span className="muted small">{card.code}</span>
        {card.hasVersion ? (
          <Link className="wb-card-open" href={`/w/${card.slug}`}>
            {openLabel}
          </Link>
        ) : (
          <span className="muted small">{outlineOnlyLabel}</span>
        )}
      </div>
    </article>
  );
}
