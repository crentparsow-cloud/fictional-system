import type { Metadata } from "next";
import Link from "next/link";
import { InfoFooter } from "@/components/InfoFooter";
import { brand } from "@/lib/brand";
import { ENQUIRY_HREF, organisationPrivacyLine } from "@/lib/plans";

/**
 * Akana for organisations (F-206, F-009). Wording follows
 * docs/research/akana-business.md: "talk to us" until prices are set, the
 * privacy line stated plainly, no church claims until faith titles exist,
 * adults only, and no promise of features that are not built (groups,
 * reports and branded portals come after launch).
 */
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: `${brand.name} for organisations`,
  description: `Guided workbooks for your staff or members, with their answers kept private from you.`,
  alternates: { canonical: "/organisations" },
};

const WHO = [
  { title: "Businesses", body: "Staff wellbeing, leadership, onboarding and team development, a week at a time." },
  { title: "Charities and community groups", body: "Workbooks for the people you support or the volunteers you train." },
  { title: "Book clubs and small groups", body: "Work through the same book together and talk about it when you meet." },
] as const;

const HOW = [
  "You choose the workbooks and how many people take part.",
  "We set up your licence. You invite your people by email, and each person uses their own private account.",
  "You see how many places are taken and how many people have started, as counts. Small numbers are not shown.",
  "Discussion stays in the room or on your call. The workbook is for each person's own answers.",
  "Taking part is each person's choice, and a wellbeing workbook is never a condition of work or membership.",
  "Everyone taking part must be 18 or over.",
] as const;

export default function OrganisationsPage() {
  return (
    <main className="wrap info-page">
      <header className="info-head">
        <p className="eyebrow muted">{brand.name} for organisations</p>
        <h1>Guided workbooks for your people, with their answers kept private</h1>
        <p className="info-lead">
          Give your staff or members guided workbooks built from published books. They read a week at a time, do the exercises and keep
          their answers. You never see what anyone wrote.
        </p>
      </header>

      <section className="card info-privacy" aria-labelledby="org-privacy">
        <h2 id="org-privacy">The privacy line</h2>
        <p>{organisationPrivacyLine(brand.name)}</p>
      </section>

      <section className="info-section" aria-labelledby="org-who">
        <h2 id="org-who">Who it is for</h2>
        <ul className="info-claims" role="list">
          {WHO.map((w) => (
            <li key={w.title} className="card">
              <h3>{w.title}</h3>
              <p>{w.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="info-section" aria-labelledby="org-how">
        <h2 id="org-how">How it works</h2>
        <ol>
          {HOW.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ol>
        <p className="muted">{brand.wellnessNotice}</p>
      </section>

      <section className="info-section" aria-labelledby="org-plans">
        <h2 id="org-plans">Plans and prices</h2>
        <p>
          We are starting with a small number of organisations. Plans and prices are not set yet, so we agree them with you. Tell us who
          you are, roughly how many people would take part and what you hope they get from it.
        </p>
        <p className="info-ctas">
          <Link className="btn" href={ENQUIRY_HREF}>
            Talk to us
          </Link>
          <Link className="btn secondary" href="/trust">
            How we protect answers
          </Link>
        </p>
        <p className="small muted">In the enquiry form, choose &quot;Other&quot; and tell us about your organisation in the notes.</p>
      </section>

      <InfoFooter />
    </main>
  );
}
