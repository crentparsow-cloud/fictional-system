import Link from "next/link";
import type { ContinueCard } from "@/lib/catalogue-types";
import { BADGE_LABELS, UNIT_WORDS } from "@/lib/catalogue-guard";
import { continueStatus } from "@/lib/continue-cards";
import type { Translate } from "@/lib/locale";

/**
 * One continue card (F-016): title, badge, one line of status, open link.
 * The status never counts days in a row or days missed (F-018).
 */
export function ContinueCardView({ card, t, now, finished }: { card: ContinueCard; t: Translate; now?: Date; finished?: boolean }) {
  const status = continueStatus(card, now);
  const unitWord = card.unitLabel === "unit" ? "Unit" : UNIT_WORDS[card.unitLabel];
  // A finished workbook stays here in Keep going mode (F-017). No count of anything.
  const line = finished
    ? "Finished. Keep going whenever you like."
    : status.kind === "startedToday"
      ? t("status.startedToday")
      : status.kind === "unit"
        ? t("status.unitOf", { unit: unitWord, n: status.unit, count: status.count })
        : t("status.inProgress");
  return (
    <article className="card continue-card">
      <div className="wb-card-top">
        <span className={`badge${card.badge === "demo" ? " demo" : ""}`}>{BADGE_LABELS[card.badge]}</span>
      </div>
      <h3 className="wb-card-title">
        <Link href={`/read/${card.slug}`}>{card.shortTitle ?? card.title}</Link>
      </h3>
      <p className="muted continue-status">{line}</p>
      <Link className="btn secondary" href={`/read/${card.slug}`}>
        {t("home.openUnit")}
      </Link>
    </article>
  );
}
