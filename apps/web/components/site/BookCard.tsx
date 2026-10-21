import Link from "next/link";
import { Cover } from "@/components/Cover";
import type { LibraryCard } from "@/lib/catalogue-types";
import { lengthBadge } from "@/lib/explore";

/**
 * A book card (redesign): the cover, a small tag, the title, the author, one
 * line on what the workbook gives you and a meta line such as "6 weeks". The
 * whole card is one link, so it holds no other links. Stable props, shared by
 * every page group:
 *
 *   title, author, promise, meta, href, code (the cover code) or cover (a
 *   ready-made node that replaces the Cover), and an optional tag.
 */
export interface BookCardProps {
  title: string;
  author?: string | null;
  /** One plain line on what the reader gets. */
  promise?: string | null;
  /** For example "6 weeks". */
  meta?: string | null;
  href: string;
  /** The workbook code, which draws the cover. */
  code?: string;
  /** A ready-made cover, used instead of the code. */
  cover?: React.ReactNode;
  /** A small label above the title, for example "Free week 1" or "Coming soon". */
  tag?: string | null;
  /** Cover width hint in pixels. The image still fills the card. */
  coverWidth?: number;
  className?: string;
}

export function BookCard({ title, author, promise, meta, href, code, cover, tag, coverWidth = 240, className }: BookCardProps) {
  return (
    <Link className={className ? `a-book ${className}` : "a-book"} href={href}>
      <span className="a-book-cover">{cover ?? (code ? <Cover code={code} title={title} author={author ?? null} width={coverWidth} /> : null)}</span>
      <span className="a-book-text">
        {tag ? <span className="a-book-tag">{tag}</span> : null}
        <span className="a-book-title">{title}</span>
        {author ? <span className="a-book-author">{author}</span> : null}
        {promise ? <span className="a-book-promise">{promise}</span> : null}
        {meta ? <span className="a-book-meta">{meta}</span> : null}
      </span>
    </Link>
  );
}

/** The short tag for a catalogue card: Demo, Coming soon or "Free week 1". */
export function bookTag(card: LibraryCard): string | null {
  if (card.isDemo) return "Demo";
  if (!card.hasVersion) return "Coming soon";
  const n = typeof card.freeUnits === "number" && Number.isFinite(card.freeUnits) ? Math.floor(card.freeUnits) : 1;
  if (n < 1) return null;
  const word = card.unitKind ?? "unit";
  return n === 1 ? `Free ${word} 1` : `Free ${word}s 1 to ${n}`;
}

/** A BookCard from a catalogue card. Same props, filled from the real data. */
export function LibraryBookCard({ card, coverWidth }: { card: LibraryCard; coverWidth?: number }) {
  return (
    <BookCard
      title={card.title}
      author={card.authors.length ? card.authors.join(", ") : null}
      promise={card.cardLine || null}
      meta={lengthBadge(card)}
      href={`/w/${card.slug}`}
      code={card.code}
      tag={bookTag(card)}
      coverWidth={coverWidth}
    />
  );
}

/** A responsive grid of book cards. */
export function BookGrid({ cards, className }: { cards: readonly LibraryCard[]; className?: string }) {
  return (
    <ul className={className ? `a-books ${className}` : "a-books"} role="list">
      {cards.map((card) => (
        <li key={card.id}>
          <LibraryBookCard card={card} />
        </li>
      ))}
    </ul>
  );
}
