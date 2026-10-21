import type { Metadata } from "next";
import Link from "next/link";
import { OrgSwitcher } from "@/components/studio/StudioBits";
import { withOrg } from "@/lib/studio";
import { HELP_TASKS, onboardingConfig } from "@/lib/studio-onboarding";
import { requireStudio } from "@/lib/studio-server";

export const metadata: Metadata = { title: "Start here", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

/**
 * The author onboarding pack (build list 14.30): help by task, the monthly
 * live Q&A and up to five short videos. The dates and the videos come from
 * configuration (lib/studio-onboarding.ts). While they are blank the Q&A block
 * says dates will be announced and the video slots do not show at all. Videos
 * are links that open on their own host. Nothing is embedded.
 */
export default async function StartHerePage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const ctx = await requireStudio("/studio/start-here", sp.org);
  const cfg = onboardingConfig();
  const q = (p: string) => (p.startsWith("/studio") ? withOrg(p, ctx.org.id, ctx.multi) : p);

  return (
    <div className="admin-page studio-page">
      <OrgSwitcher ctx={ctx} path="/studio/start-here" />
      <h1>Start here</h1>
      <p className="muted">Everything an author needs in the first weeks, by what you are trying to do.</p>

      <section aria-labelledby="tasks-h">
        <h2 id="tasks-h">Help by task</h2>
        <ul className="studio-list">
          {HELP_TASKS.map((t) => (
            <li key={t.title} className="card">
              <h3>
                <Link href={q(t.href)}>{t.title}</Link>
              </h3>
              <p className="muted">{t.line}</p>
            </li>
          ))}
        </ul>
        <p>
          More in the <Link href="/studio/help">help pages</Link>.
        </p>
      </section>

      <section className="card" aria-labelledby="qa-h">
        <h2 id="qa-h">Monthly live Q&amp;A</h2>
        {cfg.qaDates.length ? (
          <>
            <p>Bring your questions. Anyone in an author or publisher team can join.</p>
            <ul className="studio-plain">
              {cfg.qaDates.map((d) => (
                <li key={d.iso}>
                  <time dateTime={d.iso}>{d.label}</time>
                </li>
              ))}
            </ul>
            {cfg.qaUrl ? (
              <p>
                <a className="btn" href={cfg.qaUrl} target="_blank" rel="noopener noreferrer">
                  Join the Q&amp;A (opens in a new tab)
                </a>
              </p>
            ) : (
              <p className="muted small">The joining link will be sent to your team before each session.</p>
            )}
          </>
        ) : (
          <p className="muted">Dates will be announced here. We run one each month.</p>
        )}
      </section>

      {cfg.videos.length ? (
        <section aria-labelledby="videos-h">
          <h2 id="videos-h">Short videos</h2>
          <ol className="studio-plain">
            {cfg.videos.map((v) => (
              <li key={v.url}>
                <a href={v.url} target="_blank" rel="noopener noreferrer">
                  {v.title} (opens in a new tab)
                </a>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
