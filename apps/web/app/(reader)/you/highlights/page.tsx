import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getReaderSession } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { loadAllMarks } from "@/lib/marks-server";
import { COLOUR_NAMES, groupMarksByWorkbook, screenHeading } from "@/lib/reading/marks";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Highlights and notes: every mark the reader has made, grouped by workbook.
 * Private to the reader. The marks are opened here on the server under the
 * reader's own client and are never cached.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("highlights.title"), robots: { index: false, follow: false } };
}

export default async function HighlightsPage() {
  const session = await getReaderSession();
  if (!session) redirect("/sign-in?next=/you/highlights");
  const { t } = await getT();
  const loaded = await loadAllMarks(await createUserClient(), session.userId);
  const groups = loaded ? groupMarksByWorkbook(loaded.items) : [];

  return (
    <section className="tab-page you-page" aria-labelledby="highlights-h">
      <h1 id="highlights-h">{t("highlights.title")}</h1>
      <p className="muted">{t("highlights.line")}</p>
      {!loaded ? (
        <p role="status">{t("highlights.failed")}</p>
      ) : (
        <>
          {loaded.unreadable > 0 ? <p role="status">{t("highlights.unreadable")}</p> : null}
          {groups.length === 0 ? (
            <div className="card empty-state">
              <p>{t("highlights.empty")}</p>
              <Link className="btn secondary" href="/my-workbooks">
                {t("highlights.emptyLink")}
              </Link>
            </div>
          ) : (
            groups.map((g) => (
              <section key={g.enrolmentId} className="highlights-group" aria-labelledby={`hl-${g.enrolmentId}`}>
                <div className="highlights-head">
                  <h2 id={`hl-${g.enrolmentId}`}>{g.title}</h2>
                  <a className="small" href={`/api/marks/export?enrolment=${g.enrolmentId}`} aria-label={t("highlights.exportFor", { title: g.title })}>
                    {t("highlights.export")}
                  </a>
                </div>
                <ul className="highlights-list">
                  {g.marks.map((m) => (
                    <li key={m.id} className="card highlights-item" style={{ "--mark-colour": `var(--mark-${m.colour})` } as React.CSSProperties}>
                      <p className="small muted">{screenHeading(m.ref)}</p>
                      {m.excerpt ? <blockquote className="highlights-quote">{m.excerpt}</blockquote> : null}
                      <p className="small muted">{t("highlights.marker", { colour: COLOUR_NAMES[m.colour].toLowerCase() })}</p>
                      {m.note.trim() ? <p>{m.note}</p> : null}
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </>
      )}
    </section>
  );
}
