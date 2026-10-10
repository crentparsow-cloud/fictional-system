import Link from "next/link";
import { WorkbookCard } from "@/components/catalogue/WorkbookCard";
import type { LibraryCard } from "@/lib/catalogue-types";

/**
 * A titled row of workbook cards. Nothing renders for an empty list, so a
 * rail with no data never shows a bare heading. The row scrolls sideways on
 * a narrow screen; every card stays a plain link.
 */
export function Rail({
  id,
  heading,
  line,
  cards,
  outlineOnlyLabel,
  openLabel,
  seeAll,
}: {
  id: string;
  heading: string;
  line?: string;
  cards: readonly LibraryCard[];
  outlineOnlyLabel: string;
  openLabel: string;
  seeAll?: { href: string; label: string };
}) {
  if (cards.length === 0) return null;
  return (
    <section className="rail" aria-labelledby={`rail-${id}`}>
      <div className="rail-head">
        <h2 id={`rail-${id}`}>{heading}</h2>
        {seeAll ? (
          <Link className="rail-all" href={seeAll.href}>
            {seeAll.label}
          </Link>
        ) : null}
      </div>
      {line ? <p className="muted small rail-line">{line}</p> : null}
      <ul className="rail-row">
        {cards.map((card) => (
          <li key={card.id}>
            <WorkbookCard card={card} outlineOnlyLabel={outlineOnlyLabel} openLabel={openLabel} />
          </li>
        ))}
      </ul>
    </section>
  );
}
