import type { Metadata } from "next";
import Link from "next/link";
import { HelpNowButton } from "@/components/HelpNowButton";
import { InfoFooter } from "@/components/InfoFooter";
import { brand } from "@/lib/brand";
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
      <Link href={taskHref(task)}>{task.label}</Link>
      {task.section ? <span className="muted small"> ({task.section})</span> : null}
    </li>
  );
}

export default async function HelpIndexPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.q) ? sp.q[0] : sp.q;
  const query = (raw ?? "").trim().slice(0, 80);
  const matches = query ? searchTasks(query) : [];
  const pages = listHelpPages();
  const support = supportContact();
  return (
    <main className="wrap info-page">
      <header className="info-head">
        <p className="eyebrow muted">{brand.name}</p>
        <h1>Help centre</h1>
        <p className="info-lead">Short answers about how {brand.name} works. Each page says what the product does today.</p>
      </header>
      <aside className="info-crisis" aria-label="Not a crisis service">
        <p>
          <strong>{brand.name} is not a crisis service.</strong> If you are in danger now, call your local emergency number. For free
          support lines where you live, use Help now.
        </p>
        <HelpNowButton />
      </aside>
      <section className="info-section" aria-labelledby="help-find">
        <h2 id="help-find">What do you want to do?</h2>
        <form action="/help" method="get" role="search" className="contact-field">
          <label htmlFor="help-q">Search by task, for example cancel, refund or stop emails</label>
          <input id="help-q" name="q" type="search" defaultValue={query} maxLength={80} autoComplete="off" />
          <button className="btn secondary" type="submit">
            Search
          </button>
        </form>
        {query ? (
          matches.length ? (
            <ul role="list" aria-label={`Results for ${query}`}>
              {matches.map((m) => (
                <TaskLink key={m.task.label} task={m.task} />
              ))}
            </ul>
          ) : (
            <p role="status">Nothing matches that. Try one word, or choose from the lists below, or contact us.</p>
          )
        ) : null}
      </section>
      {tasksByGroup().map((g) => (
        <section key={g.group} className="info-section" aria-label={g.group}>
          <h2>{g.group}</h2>
          <ul role="list">
            {g.tasks.map((t) => (
              <TaskLink key={t.label} task={t} />
            ))}
          </ul>
        </section>
      ))}
      <h2>Every help page</h2>
      <ul className="info-topics" role="list">
        {pages.map((p) => (
          <li key={p.slug}>
            <Link className="card info-topic" href={`/help/${p.slug}`}>
              <span className="info-topic-title">{p.title}</span>
              <span className="muted">{p.summary}</span>
            </Link>
          </li>
        ))}
      </ul>
      <section className="info-section" aria-labelledby="help-contact">
        <h2 id="help-contact">Contact us</h2>
        <p>
          Email{" "}
          {support.email ? <a href={`mailto:${support.email}`}>{support.label}</a> : <span>{support.label}</span>} from the address on your
          account. We read every message. We cannot reply to emergencies.
        </p>
      </section>
      <InfoFooter />
    </main>
  );
}
