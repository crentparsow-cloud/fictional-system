import type { Metadata } from "next";
import Link from "next/link";
import { HelpNowButton } from "@/components/HelpNowButton";
import { InfoFooter } from "@/components/InfoFooter";
import { DHero } from "@/components/info/DHero";
import { brand } from "@/lib/brand";
import { company } from "@/lib/company";
import { listHelpPages, supportContact } from "@/lib/help";
import { searchTasks, taskHref, tasksByGroup, type HelpTask } from "@/lib/help-tasks";
import { publicRobots } from "@/lib/indexing";

/**
 * The help centre index (F-010), organised by task (7.8). Help now sits at
 * the top because readers come here when something is wrong, and the page
 * says plainly that Akana is not a crisis service. Below it, a box that
 * searches the tasks ("cancel", "money back", "stop emails") with a plain
 * GET form, so it works with no JavaScript, then the jobs grouped under five
 * headings, then every page by name. The answers are the pages in
 * content/help.
 */
export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

export const metadata: Metadata = {
  title: "Help centre",
  description: `Answers about your ${brand.name} account, membership, cancelling, refunds, privacy, Help now and check-in partners.`,
  alternates: { canonical: "/help" },
  robots: publicRobots(),
};

function TaskLink({ task }: { task: HelpTask }) {
  return (
    <li>
      <Link className="d-tasklink" href={taskHref(task)}>{task.label}</Link>
      {task.section ? <span className="muted small"> ({task.section})</span> : null}
    </li>
  );
}

const slug = (g: string) => g.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export default async function HelpIndexPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.q) ? sp.q[0] : sp.q;
  const query = (raw ?? "").trim().slice(0, 80);
  const matches = query ? searchTasks(query) : [];
  const pages = listHelpPages();
  const support = supportContact();
  const groups = tasksByGroup();
  return (
    <main className="d-page">
      <DHero title="How can we help?" align="center">
        <form action="/help" method="get" role="search" className="d-searchform">
          <label htmlFor="help-q" className="d-searchlabel">
            Search by task, for example cancel, refund or stop emails
          </label>
          <input id="help-q" name="q" type="search" defaultValue={query} maxLength={80} autoComplete="off" placeholder="Search for an answer" className="d-input" />
          <button className="btn" type="submit">
            Search
          </button>
        </form>
        {query ? (
          <div className="d-results" aria-live="polite">
            {matches.length ? (
              <ul role="list" aria-label={`Results for ${query}`}>
                {matches.map((m) => (
                  <TaskLink key={m.task.label} task={m.task} />
                ))}
              </ul>
            ) : (
              <p role="status">Nothing matches that. Try one word, or choose from the lists below, or contact us.</p>
            )}
          </div>
        ) : null}
      </DHero>

      <section className="d-section" aria-label="Help topics">
        <div className="wrap">
          <ul className="d-tiles" role="list">
            {groups.map((g, i) => (
              <li key={g.group}>
                <a className={`d-tile d-tile-${i % 5}`} href={`#help-${slug(g.group)}`}>
                  <h2>{g.group}</h2>
                  <span>{g.tasks.length === 1 ? "1 answer" : `${g.tasks.length} answers`}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="d-section" aria-labelledby="help-answers">
        <div className="wrap d-stack">
          <h2 id="help-answers">What do you want to do?</h2>
          {groups.map((g) => (
            <section key={g.group} id={`help-${slug(g.group)}`} className="d-group" aria-labelledby={`hg-${slug(g.group)}`}>
              <h3 id={`hg-${slug(g.group)}`}>{g.group}</h3>
              <ul role="list" className="d-tasklist">
                {g.tasks.map((t) => (
                  <TaskLink key={t.label} task={t} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </section>

      <section className="d-section" aria-labelledby="help-pages">
        <div className="wrap d-stack">
          <h2 id="help-pages">Every help page</h2>
          <ul className="d-cards" role="list">
            {pages.map((p) => (
              <li key={p.slug}>
                <Link className="d-card d-card-link" href={`/help/${p.slug}`}>
                  <span className="d-card-title">{p.title}</span>
                  <span className="d-soft">{p.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="d-band" aria-label="Still need help">
        <div className="wrap d-split">
          <div className="d-stack-s" id="help-contact">
            <h2>Still stuck?</h2>
            <p className="d-soft">
              Write to us and a real person will reply. We aim to answer within {company.replyTime}. Please write from the address on your account. We
              cannot reply to emergencies.
            </p>
            <p className="d-strong">{support.email ? <a href={`mailto:${support.email}`}>{support.label}</a> : <span>{support.label}</span>}</p>
          </div>
          <aside className="d-stack-s" aria-label={`${brand.name} is not a crisis service`}>
            <h2>Need to talk to someone today?</h2>
            <p className="d-soft">
              {brand.name} is not a crisis service. If you are in danger now, call your local emergency number. For free support lines where you
              live, use Help now.
            </p>
            <p>
              <HelpNowButton />
            </p>
          </aside>
        </div>
      </section>
      <div className="wrap">
        <InfoFooter />
      </div>
    </main>
  );
}
