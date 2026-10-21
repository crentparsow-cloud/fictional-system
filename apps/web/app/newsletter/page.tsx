import type { Metadata } from "next";
import { InfoFooter } from "@/components/InfoFooter";
import { brand } from "@/lib/brand";
import { publicRobots } from "@/lib/indexing";
import { signupReadiness } from "@/lib/newsletter";
import { SignupForm } from "./signup-form";

/**
 * The newsletter sign-up (6.11). One email a week with one short exercise.
 * While the sending domain is not set up the page says it opens soon and
 * shows no form, so no address is collected that could not be confirmed.
 */
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  const open = signupReadiness().ok;
  return {
    title: "The weekly newsletter",
    description: `One short exercise in your inbox each week from ${brand.name}.`,
    alternates: { canonical: "/newsletter" },
    robots: open ? publicRobots() : { index: false, follow: false },
  };
}

export default function NewsletterPage() {
  const open = signupReadiness().ok;
  return (
    <main className="wrap info-page">
      <header className="info-head">
        <p className="eyebrow muted">{brand.name}</p>
        <h1>The weekly newsletter</h1>
        <p className="info-lead">One email a week with one short exercise you can try in a few minutes.</p>
      </header>

      {open ? (
        <section className="info-section" aria-labelledby="nl-join">
          <h2 id="nl-join">Sign up</h2>
          <SignupForm />
        </section>
      ) : (
        <section className="info-section" aria-labelledby="nl-soon">
          <h2 id="nl-soon">Opening soon</h2>
          <p>The newsletter is not open yet. This page will have the sign-up form when it is.</p>
        </section>
      )}

      <section className="info-section" aria-labelledby="nl-how">
        <h2 id="nl-how">How it works</h2>
        <ul>
          <li>You give your email address and we send one message to check it is yours. Nothing else comes until you press the button in it.</li>
          <li>Each issue has one exercise. It never needs an account.</li>
          <li>Every email has an unsubscribe link, and it works at once.</li>
          <li>Sometimes a note from another author appears in an issue. It is always marked Sponsored, and we are paid to include it.</li>
          <li>There are no tracking pixels. We use your address for the newsletter and for nothing else.</li>
        </ul>
      </section>
      <InfoFooter />
    </main>
  );
}
