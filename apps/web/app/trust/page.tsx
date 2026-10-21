import type { Metadata } from "next";
import Link from "next/link";
import { InfoFooter } from "@/components/InfoFooter";
import { DHero } from "@/components/info/DHero";
import { brand } from "@/lib/brand";
import { company, support } from "@/lib/company";
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
  const contact = support();
  const toc: { href: string; label: string }[] = [
    { href: "#trust-compare", label: "What we never do" },
    { href: "#trust-analytics", label: ANALYTICS_RULE.title },
    { href: "#trust-export", label: EXPORT_PROMISE.title },
    { href: "#trust-more", label: "More we do for you" },
    { href: "#trust-never", label: "What we never collect" },
    ...(status ? [{ href: "#trust-status", label: `Is ${brand.name} working?` }] : []),
    { href: "#trust-wellness", label: "Wellness, not treatment" },
    { href: "#trust-access", label: "Accessibility" },
    { href: "#trust-company", label: "Who we are" },
  ];
  return (
    <main className="d-page">
      <DHero
        eyebrow="Trust"
        title="How we look after you"
        lead="Your answers are yours. This page lists only what the product does today. Each point is built into the code or checked in every build, not just written in our terms. If we cannot enforce something, it is not on this page."
      />

      <div className="wrap d-trust">
        <nav className="d-toc" aria-label="On this page">
          <ul role="list">
            {toc.map((t) => (
              <li key={t.href}>
                <a href={t.href}>{t.label}</a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="d-trust-body">
          <section id="trust-compare" className="d-block" aria-labelledby="trust-compare-h">
            <h2 id="trust-compare-h">What we never do</h2>
            <p>Many apps do the things in the middle column. We do not.</p>
            <div className="md-table d-tablewrap" role="region" aria-label="What we never do, compared" tabIndex={0}>
              <table className="compare-table d-table">
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

          <section id="trust-analytics" className="d-block" aria-labelledby="trust-analytics-h">
            <h2 id="trust-analytics-h">{ANALYTICS_RULE.title}</h2>
            <p>{ANALYTICS_RULE.body}</p>
          </section>

          <section id="trust-export" className="d-block" aria-labelledby="trust-export-h">
            <h2 id="trust-export-h">{EXPORT_PROMISE.title}</h2>
            <p>{EXPORT_PROMISE.body}</p>
            <p>
              The download is on your <Link href="/you">You page</Link>. Our <Link href="/legal/privacy">privacy notice</Link> explains your other rights.
            </p>
          </section>

          <section id="trust-more" className="d-block" aria-labelledby="trust-more-h">
            <h2 id="trust-more-h">More we do for you</h2>
            <ul className="d-cards" role="list">
              {TRUST_CLAIMS.map((c) => (
                <li key={c.title} className="d-card">
                  <h3>{c.title}</h3>
                  <p className="d-soft">{c.body}</p>
                </li>
              ))}
            </ul>
          </section>

          <section id="trust-never" className="d-block" aria-labelledby="trust-never-h">
            <h2 id="trust-never-h">What we never collect</h2>
            <ul className="d-cards" role="list">
              {NEVER_COLLECT.map((c) => (
                <li key={c.title} className="d-card">
                  <h3>{c.title}</h3>
                  <p className="d-soft">{c.body}</p>
                </li>
              ))}
            </ul>
          </section>

          {status ? (
            <section id="trust-status" className="d-block" aria-labelledby="trust-status-h">
              <h2 id="trust-status-h">Is {brand.name} working?</h2>
              <p>
                Our <a href={status} rel="noopener noreferrer">public status page</a> shows whether the site is up and lists past problems.
              </p>
            </section>
          ) : null}

          <section id="trust-wellness" className="d-block" aria-labelledby="trust-wellness-h">
            <h2 id="trust-wellness-h">Wellness, not treatment</h2>
            <p>{brand.wellnessNotice} If you are worried about your health, talk to a doctor or another health professional.</p>
            <p>
              {brand.name} is not a crisis service. If you are in danger now, call your local emergency number. <Link href="/help-now">Help now</Link>{" "}
              lists free support lines where you live.
            </p>
          </section>

          <section id="trust-access" className="d-block" aria-labelledby="trust-access-h">
            <h2 id="trust-access-h">Accessibility</h2>
            <p>
              We aim for WCAG 2.2 level AA. Read the <Link href="/accessibility">accessibility statement</Link> for what has been tested, what is
              known to fall short and how to tell us about a problem.
            </p>
          </section>

          <section id="trust-company" className="d-block" aria-labelledby="trust-company-h">
            <h2 id="trust-company-h">Who we are</h2>
            <p>
              {brand.name} is the seller of every workbook and membership on the {brand.name} marketplace. {company.legalName}, {company.address.join(", ")}.
              Company number: {company.registrationNumber}. Write to us at{" "}
              {contact.email ? <a href={`mailto:${contact.email}`}>{contact.label}</a> : <span>{contact.label}</span>}.
            </p>
            <p>
              The documents behind these points are the <Link href="/legal/terms">reader terms</Link>, the{" "}
              <Link href="/legal/privacy">privacy notice</Link>, the <Link href="/legal/cookies">cookie statement</Link> and the{" "}
              <Link href="/legal/refunds">refund policy</Link>. They are drafts with our lawyer.
            </p>
          </section>
        </div>
      </div>

      <div className="wrap">
        <InfoFooter />
      </div>
    </main>
  );
}
