import type { Metadata } from "next";
import Link from "next/link";
import { NeedSupportFooter } from "@/components/NeedSupportFooter";
import { getReaderSession } from "@/lib/auth";
import { BADGE_LABELS } from "@/lib/catalogue-guard";
import { filterMine, lengthBadge, mineCounts, parseMineFilter, parseMineSort, sortMine, statusChip, type MineFilter, type MineSort } from "@/lib/explore";
import { myWorkbooks } from "@/lib/explore-queries";
import { getT, type MessageKey } from "@/lib/i18n";

/**
 * My workbooks (build list 2.12): the signed-in reader's own shelf. Every
 * title they have started, with a status chip (reading, finished, paused),
 * the filters All, Reading and Finished, and a sort by last opened or title.
 * State lives in the URL, so the page is server rendered. Nothing here counts
 * days, streaks or missed steps: the chips say where a title stands and the
 * date says when it was last opened.
 */
export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

const BASE = "/my-workbooks";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("mine.title") };
}

const FILTER_KEYS: Record<MineFilter, MessageKey> = { all: "mine.all", reading: "mine.reading", finished: "mine.finished" };
const SORT_KEYS: Record<MineSort, MessageKey> = { opened: "mine.sortOpened", title: "mine.sortTitle" };
const STATUS_KEYS = { reading: "mine.statusReading", finished: "mine.statusFinished", paused: "mine.statusPaused" } as const satisfies Record<string, MessageKey>;

function href(filter: MineFilter, sort: MineSort): string {
  const p = new URLSearchParams();
  if (filter !== "all") p.set("status", filter);
  if (sort !== "opened") p.set("sort", sort);
  const q = p.toString();
  return q ? `${BASE}?${q}` : BASE;
}

export default async function MyWorkbooksPage({ searchParams }: { searchParams: Promise<Search> }) {
  const [{ t, locale }, sp, session] = await Promise.all([getT(), searchParams, getReaderSession()]);
  const filter = parseMineFilter(sp.status);
  const sort = parseMineSort(sp.sort);
  const all = session ? await myWorkbooks(session.userId) : [];
  const counts = mineCounts(all);
  const rows = sortMine(filterMine(all, filter), sort);
  const date = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });

  return (
    <section className="tab-page my-workbooks-page">
      <h1>{t("mine.title")}</h1>
      <p className="muted">{t("mine.line")}</p>

      {all.length === 0 ? (
        <div className="card empty-state">
          <p>{t("mine.empty")}</p>
          <Link className="btn" href="/explore">
            {t("mine.explore")}
          </Link>
        </div>
      ) : (
        <>
          <div className="library-filters">
            <nav className="chips library-chip-row" aria-label={t("mine.filters")}>
              <span className="library-chip-label small" aria-hidden="true">
                {t("mine.filters")}
              </span>
              {(Object.keys(FILTER_KEYS) as MineFilter[]).map((f) => (
                <Link key={f} className="chip" href={href(f, sort)} aria-current={filter === f ? "true" : undefined}>
                  {t(FILTER_KEYS[f])} <span className="mine-chip-count">{counts[f]}</span>
                </Link>
              ))}
            </nav>
            <nav className="chips library-chip-row" aria-label={t("mine.sort")}>
              <span className="library-chip-label small" aria-hidden="true">
                {t("mine.sort")}
              </span>
              {(Object.keys(SORT_KEYS) as MineSort[]).map((s) => (
                <Link key={s} className="chip" href={href(filter, s)} aria-current={sort === s ? "true" : undefined}>
                  {t(SORT_KEYS[s])}
                </Link>
              ))}
            </nav>
          </div>

          <p className="muted small library-count" role="status">
            {rows.length === 1 ? t("mine.countOne") : t("mine.count", { count: rows.length })}
          </p>

          {rows.length === 0 ? (
            <div className="card empty-state">
              <p>{t("mine.emptyFiltered")}</p>
              <Link className="btn secondary" href={BASE}>
                {t("library.clear")}
              </Link>
            </div>
          ) : (
            <ul className="mine-list">
              {rows.map((r) => {
                const chip = statusChip(r.status);
                const length = lengthBadge(r);
                return (
                  <li key={r.enrolmentId} className="card mine-card">
                    <div className="wb-card-top">
                      <span className={`chip mine-status mine-status-${chip}`}>{t(STATUS_KEYS[chip])}</span>
                      <span className={`badge${r.badge === "demo" ? " demo" : ""}`}>{BADGE_LABELS[r.badge]}</span>
                      {length ? <span className="badge programme">{length}</span> : null}
                    </div>
                    <h2 className="wb-card-title">
                      <Link href={`/w/${r.slug}`}>{r.title}</Link>
                    </h2>
                    {r.authors.length ? <p className="wb-card-author muted">{r.authors.join(", ")}</p> : null}
                    <div className="wb-card-foot">
                      <span className="muted small">{t("mine.lastOpened", { date: date.format(new Date(r.lastOpenedAt)) })}</span>
                      <Link className="wb-card-open" href={r.status === "finished" ? `/w/${r.slug}` : `/read/${r.slug}`}>
                        {r.status === "finished" ? t("mine.view") : t("mine.continue")}
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <NeedSupportFooter label={t("help.needSupport")} />
    </section>
  );
}
