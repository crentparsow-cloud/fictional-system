import type { Metadata } from "next";
import Link from "next/link";
import { InfoFooter } from "@/components/InfoFooter";
import { DHero } from "@/components/info/DHero";
import { ReadingSettingsPanel } from "@/components/reader/ReadingSettingsPanel";
import { support } from "@/lib/company";
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
    <ul className="d-cards" role="list">
      {items.map((i) => (
        <li key={i.title} className="d-card">
          <h4>{i.title}</h4>
          <p>{i.body}</p>
        </li>
      ))}
    </ul>
  );
}

export default function AccessibilityPage() {
  const contact = support();
  return (
    <main className="d-page">
      <DHero
        eyebrow="Accessibility"
        title="Reading your way"
        lead="Every page can be read at the size, in the font and on the page colour that suits you. Your choice stays on the device you are using, and follows you if you are signed in."
      />

      <section className="d-section" aria-labelledby="a11y-settings">
        <div className="wrap d-split d-split-top">
          <div className="d-card d-card-roomy">
            <h2 id="a11y-settings">Your reading settings</h2>
            <p className="d-soft">Changes apply to this page straight away. The same settings are under the Aa button in any week.</p>
            <ReadingSettingsPanel variant="inline" />
          </div>
          <div className="d-stack-s">
            <p className="d-eyebrow">Live preview</p>
            <div className="d-card d-card-roomy d-preview">
              <h3>Read a week. Try it. Keep what works.</h3>
              <p>This is how text will look on your reading screens. Change the font, size or page colour and watch this paragraph change.</p>
              <p>A good font is one you can read without effort. If a different face or a bigger size helps, use it.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="d-section" aria-labelledby="a11y-statement">
        <div className="wrap d-stack">
          <header className="d-stack-s">
            <h2 id="a11y-statement">Our accessibility statement</h2>
            <p className="d-lead-s">{A.aim}</p>
            <p className="small d-soft">
              Standard we aim for: {A.standard}. Last reviewed {A.reviewed}. Automated sweep last run {A.sweepRun}.
            </p>
          </header>

          <section aria-labelledby="a11y-tested" className="d-stack-s">
            <h3 id="a11y-tested">What we have tested</h3>
            <Items items={A.tested} />
          </section>

          <section aria-labelledby="a11y-not-yet" className="d-stack-s">
            <h3 id="a11y-not-yet">What we have not yet tested</h3>
            <Items items={A.notYetTested} />
          </section>

          <section aria-labelledby="a11y-known" className="d-stack-s">
            <h3 id="a11y-known">Known issues and limits</h3>
            <Items items={A.knownIssues} />
          </section>

          <section aria-labelledby="a11y-report" className="d-stack-s">
            <h3 id="a11y-report">Conformance report for organisations</h3>
            <p>{A.conformance}</p>
            <p>
              <Link className="btn secondary" href={A.conformancePath}>
                Read the conformance report
              </Link>
            </p>
          </section>
        </div>
      </section>

      <section className="d-band" aria-labelledby="a11y-contact">
        <div className="wrap d-stack-s">
          <h2 id="a11y-contact">Found a barrier?</h2>
          <p>
            {A.contact.howTo} <Link href={A.contact.route}>Contact us</Link>.
          </p>
          <p>{A.contact.reply}</p>
          <p className="d-strong">{contact.email ? <a href={`mailto:${contact.email}`}>{contact.label}</a> : <span>{contact.label}</span>}</p>
          <p>
            If you are not happy with our reply, you can contact the Equality Advisory and Support Service, which gives free advice on
            discrimination and equality rights in Great Britain.
          </p>
        </div>
      </section>

      <div className="wrap">
        <InfoFooter />
      </div>
    </main>
  );
}
