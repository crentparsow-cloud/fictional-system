import type { Metadata } from "next";
import Link from "next/link";
import { InfoFooter } from "@/components/InfoFooter";
import { brand } from "@/lib/brand";
import { ANALYTICS_RULE, EXPORT_PROMISE, NEVER_COLLECT, statusPageUrl, TRUST_CLAIMS, TRUST_COMPARISON } from "@/lib/trust";

/**
 * The trust page (F-121, 11.1). Only what the code enforces today; each
 * statement names its mechanism in lib/trust.ts and a test keeps those files
 * in place. The comparison is general: no product is named. The status page
 * link shows only while STATUS_PAGE_URL is set (read at build, so a change
 * needs a redeploy). Company details stay placeholders until gate O1 clears.
 */
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Trust",
  description: `What ${brand.name} never does that other apps do, and what it does with your answers and your data.`,
  alternates: { canonical: "/trust" },
};

export default function TrustPage() {
  const status = statusPageUrl();
  return (
    <main className="wrap info-page">
      <header className="info-head">
        <p className="eyebrow muted">{brand.name}</p>
        <h1>Trust</h1>
        <p className="info-lead">
          This page lists only what the product does today. Each point is built into the code or checked in every build, not just written
          in our terms. If we cannot enforce something, it is not on this page.
        </p>
      </header>

      <section className="info-section" aria-labelledby="trust-compare">
        <h2 id="trust-compare">What we never do</h2>
        <p>Many apps do the things in the left column. We do not.</p>
        <div className="md-table" role="region" aria-label="What we never do, compared" tabIndex={0}>
          <table className="compare-table">
            <thead>
              <tr>
                <th scope="col">Practice</th>
                <th scope="col">Many apps</th>
                <th scope="col">{brand.name}</th>
              </tr>
            </thead>
            <tbody>
              {TRUST_COMPARISON.map((r) => (
                <tr key={r.practice}>
                  <th scope="row">{r.practice}</th>
                  <td>{r.others}</td>
                  <td>{r.akana}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="info-section" aria-labelledby="trust-analytics">
        <h2 id="trust-analytics">{ANALYTICS_RULE.title}</h2>
        <p>{ANALYTICS_RULE.body}</p>
      </section>

      <section className="info-section" aria-labelledby="trust-export">
        <h2 id="trust-export">{EXPORT_PROMISE.title}</h2>
        <p>{EXPORT_PROMISE.body}</p>
        <p>
          The download is on your <Link href="/you">You page</Link>. Our <Link href="/legal/privacy">privacy notice</Link> explains your other rights.
        </p>
      </section>

      <section className="info-section" aria-labelledby="trust-more">
        <h2 id="trust-more">More we do for you</h2>
        <ul className="info-claims" role="list">
          {TRUST_CLAIMS.map((c) => (
            <li key={c.title} className="card">
              <h3>{c.title}</h3>
              <p>{c.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="info-section" aria-labelledby="trust-never">
        <h2 id="trust-never">What we never collect</h2>
        <ul className="info-claims" role="list">
          {NEVER_COLLECT.map((c) => (
            <li key={c.title} className="card">
              <h3>{c.title}</h3>
              <p>{c.body}</p>
            </li>
          ))}
        </ul>
      </section>

      {status ? (
        <section className="info-section" aria-labelledby="trust-status">
          <h2 id="trust-status">Is {brand.name} working?</h2>
          <p>
            Our <a href={status} rel="noopener noreferrer">public status page</a> shows whether the site is up and lists past problems.
          </p>
        </section>
      ) : null}

      <section className="info-section" aria-labelledby="trust-wellness">
        <h2 id="trust-wellness">Wellness, not treatment</h2>
        <p>{brand.wellnessNotice} If you are worried about your health, talk to a doctor or another health professional.</p>
        <p>
          {brand.name} is not a crisis service. If you are in danger now, call your local emergency number. <Link href="/help-now">Help now</Link>{" "}
          lists free support lines where you live.
        </p>
      </section>

      <section className="info-section" aria-labelledby="trust-access">
        <h2 id="trust-access">Accessibility</h2>
        <p>
          We aim for WCAG 2.2 level AA. Read the <Link href="/accessibility">accessibility statement</Link> for what has been tested, what is
          known to fall short and how to tell us about a problem.
        </p>
      </section>

      <section className="info-section" aria-labelledby="trust-company">
        <h2 id="trust-company">Who we are</h2>
        <p>
          {brand.name} is the seller of every workbook and membership on the {brand.name} marketplace. Company name, registered number and
          registered address: [company details to follow].
        </p>
        <p>
          The documents behind these points are the <Link href="/legal/terms">reader terms</Link>, the{" "}
          <Link href="/legal/privacy">privacy notice</Link>, the <Link href="/legal/cookies">cookie statement</Link> and the{" "}
          <Link href="/legal/refunds">refund policy</Link>. They are drafts with our lawyer.
        </p>
      </section>

      <InfoFooter />
    </main>
  );
}
