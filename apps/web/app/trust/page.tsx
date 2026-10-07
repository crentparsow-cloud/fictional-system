import type { Metadata } from "next";
import Link from "next/link";
import { InfoFooter } from "@/components/InfoFooter";
import { brand } from "@/lib/brand";
import { NEVER_COLLECT, TRUST_CLAIMS } from "@/lib/trust";

/**
 * The trust page (F-121). Only what the code enforces today; each statement
 * names its mechanism in lib/trust.ts and a test keeps those files in place.
 * Company details stay placeholders until gate O1 clears.
 */
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Trust",
  description: `What ${brand.name} does with your answers and your data, stated only where the product enforces it.`,
  alternates: { canonical: "/trust" },
};

export default function TrustPage() {
  return (
    <main className="wrap info-page">
      <header className="info-head">
        <p className="eyebrow muted">{brand.name}</p>
        <h1>Trust</h1>
        <p className="info-lead">
          This page lists only what the product does today. Each point is built into the code, not just written in our terms. If we
          cannot enforce something, it is not on this page.
        </p>
      </header>

      <ul className="info-claims" role="list">
        {TRUST_CLAIMS.map((c) => (
          <li key={c.title} className="card">
            <h2>{c.title}</h2>
            <p>{c.body}</p>
          </li>
        ))}
      </ul>

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
          Buttons and links on reader screens are at least 44 pixels tall. The site follows your device&apos;s light or dark setting. Key
          pages are checked with an automated tool against WCAG 2.2 levels A and AA. A full accessibility statement will follow.
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
