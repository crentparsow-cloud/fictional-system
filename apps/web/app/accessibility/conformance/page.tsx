import type { Metadata } from "next";
import Link from "next/link";
import { InfoFooter } from "@/components/InfoFooter";
import { ACCESSIBILITY as A } from "@/lib/accessibility";
import { brand } from "@/lib/brand";
import { byPrinciple, CRITERIA, PRINCIPLES, tally, VPAT } from "@/lib/vpat";

/**
 * The conformance report in the VPAT layout. Static. The content and the rule
 * about never over-claiming are in lib/vpat.ts.
 */
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Accessibility conformance report",
  description: `${brand.name} measured against ${VPAT.standard}, criterion by criterion, with what has and has not been confirmed.`,
  alternates: { canonical: "/accessibility/conformance" },
};

export default function ConformancePage() {
  const t = tally();
  return (
    <main className="wrap info-page">
      <header className="info-head">
        <p className="eyebrow muted">{brand.name}</p>
        <h1>Accessibility conformance report</h1>
        <p className="info-lead">{VPAT.summary}</p>
        <p className="small muted">
          Standard: {VPAT.standard}. Report date: {VPAT.reportDate}. {VPAT.format}
        </p>
        <p>
          <Link href="/accessibility">Back to the accessibility statement</Link>
        </p>
      </header>

      <section className="info-section" aria-labelledby="vpat-scope">
        <h2 id="vpat-scope">What this covers</h2>
        <p>{VPAT.scope}</p>
        <p>
          <strong>Evidence:</strong> {VPAT.evidence}
        </p>
        <p>
          {t.total} criteria: {t.partial} partially supported, {t.notApplicable} not applicable, {t.notEvaluated} not yet evaluated.
        </p>
      </section>

      <section className="info-section" aria-labelledby="vpat-terms">
        <h2 id="vpat-terms">The words we use</h2>
        <dl className="admin-dl">
          {VPAT.terms.map((x) => (
            <div key={x.term}>
              <dt>{x.term}</dt>
              <dd>{x.meaning}</dd>
            </div>
          ))}
        </dl>
      </section>

      {PRINCIPLES.map((p) => (
        <section key={p.n} className="info-section" aria-labelledby={`vpat-p${p.n}`}>
          <h2 id={`vpat-p${p.n}`}>
            {p.n}. {p.name}
          </h2>
          <div className="admin-table-wrap" tabIndex={0} role="region" aria-labelledby={`vpat-p${p.n}`}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Criterion</th>
                  <th scope="col">Level</th>
                  <th scope="col">Result</th>
                  <th scope="col">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {byPrinciple(p.n, CRITERIA).map((x) => (
                  <tr key={x.id}>
                    <th scope="row">
                      {x.id} {x.name}
                    </th>
                    <td>{x.level}</td>
                    <td>{x.status}</td>
                    <td>{x.remarks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <section className="info-section" aria-labelledby="vpat-limits">
        <h2 id="vpat-limits">Limits of this report</h2>
        <ul>
          {VPAT.limits.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </section>

      <section className="info-section" aria-labelledby="vpat-contact">
        <h2 id="vpat-contact">Tell us about a problem</h2>
        <p>
          {A.contact.howTo} <Link href={VPAT.contactRoute}>Contact us</Link>.
        </p>
      </section>

      <InfoFooter />
    </main>
  );
}
