import type { Metadata } from "next";
import Link from "next/link";
import { HelpNowButton } from "@/components/HelpNowButton";
import { InfoFooter } from "@/components/InfoFooter";
import { brand } from "@/lib/brand";
import { listHelpPages, supportContact } from "@/lib/help";

/**
 * The help centre index (F-010). Static, built from content/help. Help now
 * sits at the top because readers come here when something is wrong, and
 * the page says plainly that Akana is not a crisis service.
 */
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Help centre",
  description: `Answers about your ${brand.name} account, membership, cancelling, refunds, privacy, Help now and check-in partners.`,
  alternates: { canonical: "/help" },
};

export default function HelpIndexPage() {
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
