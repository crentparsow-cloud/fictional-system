import Link from "next/link";
import { WorkbookCard } from "@/components/catalogue/WorkbookCard";
import { listLibrary } from "@/lib/catalogue";
import { getT } from "@/lib/i18n";
import { pickStarters } from "@/lib/starters";
import type { LibraryCard } from "@/lib/catalogue-types";

/**
 * The first-run state for My workbooks, Today and Home: three starter
 * workbooks to open, not a sentence (7.5). If the catalogue cannot be read,
 * one plain sentence and a link to the Library stand in.
 */
export async function Starters() {
  const { t } = await getT();
  let cards: LibraryCard[] = [];
  try {
    cards = pickStarters(await listLibrary());
  } catch {
    cards = [];
  }
  if (cards.length === 0) {
    return (
      <div className="starters">
        <p>{t("starters.none")}</p>
        <Link className="btn" href="/explore">
          {t("home.browse")}
        </Link>
      </div>
    );
  }
  return (
    <section className="starters" aria-labelledby="starters-heading">
      <h2 id="starters-heading" className="section-title">
        {t("starters.heading")}
      </h2>
      <p className="muted">{t("starters.line")}</p>
      <div className="grid wb-grid">
        {cards.map((card) => (
          <WorkbookCard key={card.id} card={card} outlineOnlyLabel={t("library.outlineOnly")} openLabel={t("library.open")} />
        ))}
      </div>
    </section>
  );
}
