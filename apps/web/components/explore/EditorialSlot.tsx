import Link from "next/link";
import { LibraryBookCard } from "@/components/site/BookCard";
import type { ResolvedSlot } from "@/lib/editorial";

/**
 * The weekly editorial slot (7.10): a staff pick with a short line and the
 * dates it covers. It has no timer and no count; the dates are words. Renders
 * nothing when there is no slot to show.
 */
export function EditorialSlot({ slot }: { slot: ResolvedSlot | null; outlineOnlyLabel?: string; openLabel?: string }) {
  if (!slot) return null;
  return (
    <section className="rail editorial-slot a-rail" aria-labelledby="editorial-slot-h">
      <div className="rail-head">
        <h2 id="editorial-slot-h">{slot.heading}</h2>
      </div>
      <p className="muted small rail-line">{slot.dates ? `Our pick for ${slot.dates}.` : "Our pick."}</p>
      {slot.line ? <p className="editorial-slot-line">{slot.line}</p> : null}
      {slot.kind === "workbook" ? (
        <div className="a-editorial-card">
          <LibraryBookCard card={slot.card} />
        </div>
      ) : (
        <p>
          <Link className="btn secondary" href={`/themes/${slot.theme.id}`}>
            {slot.theme.name}
          </Link>
        </p>
      )}
    </section>
  );
}
