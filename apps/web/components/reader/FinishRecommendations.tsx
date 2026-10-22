import Link from "next/link";

export interface RecommendedAuthor {
  name: string;
  slug: string;
}

/**
 * Shown on the Finish screen after the book card (14.12): up to three authors
 * the workbook's author recommends. Plain links to their pages. Nothing is
 * counted and nothing is sent anywhere.
 */
export function FinishRecommendations({ authors }: { authors: readonly RecommendedAuthor[] }) {
  if (authors.length === 0) return null;
  return (
    <section className="ak-card ak-card-flat" aria-labelledby="finish-recs">
      <p id="finish-recs" className="ak-eyebrow">
        Authors this author recommends
      </p>
      <ul className="ak-list">
        {authors.map((a) => (
          <li key={a.slug}>
            <Link href={`/authors/${a.slug}`}>{a.name}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
