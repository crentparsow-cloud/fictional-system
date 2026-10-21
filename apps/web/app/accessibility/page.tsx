import type { Metadata } from "next";
import Link from "next/link";
import { InfoFooter } from "@/components/InfoFooter";
import { ACCESSIBILITY as A } from "@/lib/accessibility";
import { brand } from "@/lib/brand";

/**
 * The accessibility statement (11.5). Static. Content and the rule about not
 * over-claiming are in lib/accessibility.ts and docs/ACCESSIBILITY.md.
 */
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Accessibility statement",
  description: `What ${brand.name} has tested against ${A.standard}, what falls short, and how to tell us about a problem.`,
  alternates: { canonical: "/accessibility" },
};

function Items({ items }: { items: readonly { title: string; body: string }[] }) {
  return (
    <ul className="info-claims" role="list">
      {items.map((i) => (
        <li key={i.title} className="card">
          <h3>{i.title}</h3>
          <p>{i.body}</p>
        </li>
      ))}
    </ul>
  );
}

export default function AccessibilityPage() {
  return (
    <main className="wrap info-page">
      <header className="info-head">
        <p className="eyebrow muted">{brand.name}</p>
        <h1>Accessibility statement</h1>
        <p className="info-lead">{A.aim}</p>
        <p className="small muted">
          Standard we aim for: {A.standard}. Last reviewed {A.reviewed}. Automated sweep last run {A.sweepRun}.
        </p>
      </header>

      <section className="info-section" aria-labelledby="a11y-tested">
        <h2 id="a11y-tested">What we have tested</h2>
        <Items items={A.tested} />
      </section>

      <section className="info-section" aria-labelledby="a11y-not-yet">
        <h2 id="a11y-not-yet">What we have not yet tested</h2>
        <Items items={A.notYetTested} />
      </section>

      <section className="info-section" aria-labelledby="a11y-known">
        <h2 id="a11y-known">Known issues and limits</h2>
        <Items items={A.knownIssues} />
      </section>

      <section className="info-section" aria-labelledby="a11y-report">
        <h2 id="a11y-report">Conformance report for organisations</h2>
        <p>{A.conformance}</p>
      </section>

      <section className="info-section" aria-labelledby="a11y-contact">
        <h2 id="a11y-contact">Tell us about a problem</h2>
        <p>
          {A.contact.howTo} <Link href={A.contact.route}>Contact us</Link>.
        </p>
        <p>{A.contact.reply}</p>
        <p>
          If you are not happy with our reply, you can contact the Equality Advisory and Support Service, which gives free advice on
          discrimination and equality rights in Great Britain.
        </p>
      </section>

      <InfoFooter />
    </main>
  );
}
