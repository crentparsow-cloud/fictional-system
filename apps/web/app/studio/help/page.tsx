import type { Metadata } from "next";
import Link from "next/link";
import { supportContact } from "@/lib/help";
import { listStudioHelpPages } from "@/lib/studio-help";

/**
 * Author help (F-044). Static, like the reader help centre: house rules in
 * plain words, how review works, pricing, how payment works and what the
 * pool will be. Open to anyone, so an invited author can read it before
 * they sign in.
 */
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Help for authors",
  description: "House rules, review, pricing, payment and the membership pool, in plain words.",
  robots: { index: false, follow: false },
};

export default function StudioHelpIndex() {
  const pages = listStudioHelpPages();
  const support = supportContact();
  return (
    <div className="admin-page studio-page info-page">
      <h1>Help for authors</h1>
      <p className="info-lead">Short answers about publishing with Akana. Each page says what is decided today and what is not.</p>
      <ul className="info-topics" role="list">
        {pages.map((p) => (
          <li key={p.slug}>
            <Link className="card info-topic" href={`/studio/help/${p.slug}`}>
              <span className="info-topic-title">{p.title}</span>
              <span className="muted">{p.summary}</span>
            </Link>
          </li>
        ))}
      </ul>
      <section className="info-section" aria-labelledby="sh-contact">
        <h2 id="sh-contact">Still have a question?</h2>
        <p>
          Email {support.email ? <a href={`mailto:${support.email}`}>{support.label}</a> : <span>{support.label}</span>}. A person reads every message.
        </p>
      </section>
    </div>
  );
}
