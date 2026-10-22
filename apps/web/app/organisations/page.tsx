import type { Metadata } from "next";
import Link from "next/link";
import { InfoFooter } from "@/components/InfoFooter";
import { DHero } from "@/components/info/DHero";
import { MarketingShot } from "@/components/MarketingShot";
import { brand } from "@/lib/brand";
import { company } from "@/lib/company";
import { organisationsPricing, PILOT_AND_REFUND_TEXT, type PriceCard } from "@/lib/org-plans";
import { loadPlanPrices } from "@/lib/org-plans-server";
import { ENQUIRY_HREF, organisationPrivacyLine } from "@/lib/plans";

/**
 * Akana for organisations (F-206, F-009). Wording follows
 * docs/research/akana-business.md: "talk to us" until prices are set, the
 * privacy line stated plainly, no church claims until faith titles exist,
 * adults only, and no promise of features that are not built (groups,
 * reports and branded portals come after launch).
 */
// Prices come from the plan price table, so the page reads it on each request.
export const dynamic = "force-dynamic";

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

function Card({ c }: { c: PriceCard }) {
  return (
    <li className="d-card">
      <h3>{c.heading}</h3>
      <p>
        <strong>{c.primary}</strong>
        {c.secondary ? <span className="muted small"> ({c.secondary})</span> : null}
      </p>
      <ul className="small d-list">
        {c.lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </li>
  );
}

export default async function OrganisationsPage() {
  const pricing = organisationsPricing(await loadPlanPrices());
  return (
    <main className="d-page">
      <DHero
        eyebrow={`${brand.name} for organisations`}
        title="Bring good books to the people you look after"
        lead="Give your staff or members guided workbooks built from published books. They read a week at a time, do the exercises and keep their answers. You never see what anyone wrote."
      >
        <p className="d-actions">
          <Link className="btn" href={ENQUIRY_HREF}>
            Talk to us
          </Link>
          <a className="btn secondary" href="#org-plans">
            See plans and prices
          </a>
        </p>
      </DHero>

      <section className="d-section" aria-labelledby="org-who">
        <div className="wrap d-stack">
          <h2 id="org-who">Who it is for</h2>
          <ul className="d-cards" role="list">
            {WHO.map((w) => (
              <li key={w.title} className="d-card">
                <h3>{w.title}</h3>
                <p className="d-soft">{w.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="d-section d-band" aria-labelledby="org-how">
        <div className="wrap d-split d-split-top">
          <div className="d-stack-s">
            <h2 id="org-how">How places work</h2>
            <ol className="d-list">
              {HOW.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ol>
            <p className="d-soft">{brand.wellnessNotice}</p>
          </div>
          <div className="d-stack-s">
            <section className="d-card d-card-roomy d-privacy" aria-labelledby="org-privacy">
              <h2 id="org-privacy">How we look after your people</h2>
              <p>{organisationPrivacyLine(brand.name)}</p>
              <p className="small d-soft">
                The <Link href="/trust">Trust page</Link> sets out how answers are kept private.
              </p>
            </section>
            <MarketingShot name="trust-desktop" alt="The Trust page: plain statements of what is private to you, what is never tracked and who can see what." />
          </div>
        </div>
      </section>

      <section className="d-section" aria-labelledby="org-plans">
        <div className="wrap d-stack">
          <h2 id="org-plans">Plans and prices</h2>
          {pricing ? (
            <>
              <p>These are the prices. You see the full amount, with any tax, before you pay.</p>
              <ul className="d-cards" role="list">
                {pricing.small ? <Card c={pricing.small} /> : null}
                {pricing.group ? <Card c={pricing.group} /> : null}
              </ul>
              {pricing.churches.length > 0 ? (
                <>
                  <h3>Churches</h3>
                  <p>The price depends on your usual Sunday attendance. You pick the band. Every member can have a place.</p>
                  <ul className="d-cards" role="list">
                    {pricing.churches.map((c) => (
                      <Card key={c.id} c={c} />
                    ))}
                  </ul>
                </>
              ) : null}
              <p>{PILOT_AND_REFUND_TEXT.larger}</p>
              <p>{PILOT_AND_REFUND_TEXT.small}</p>
              <p>{PILOT_AND_REFUND_TEXT.kit}</p>
              <p className="d-actions">
                <Link className="btn" href="/org/start">
                  Start an organisation
                </Link>
              </p>
            </>
          ) : (
            <p>
              We are starting with a small number of organisations. Plans and prices are not set yet, so we agree them with you. Tell us who
              you are, roughly how many people would take part and what you hope they get from it.
            </p>
          )}
        </div>
      </section>

      <section className="d-section" aria-labelledby="org-branded">
        <div className="wrap">
          <div className="d-card d-card-roomy d-stack-s">
            <p className="d-eyebrow">Branded sites</p>
            <h2 id="org-branded">Your own {brand.name}, in your colours</h2>
            <p className="d-soft">A branded home for your readers, with your name on the door. The reading experience stays the same.</p>
            <p>
              <Link className="btn secondary" href="/white-label">
                About branded sites
              </Link>
            </p>
          </div>
        </div>
      </section>

      <section className="d-section d-band" aria-labelledby="org-talk">
        <div className="wrap d-stack-s">
          <h2 id="org-talk">Talk to us</h2>
          <p>Tell us about your group. We reply within {company.replyTime}.</p>
          <p className="d-actions">
            <Link className="btn" href={ENQUIRY_HREF}>
              Talk to us
            </Link>
            <Link className="btn secondary" href="/trust">
              How we protect answers
            </Link>
          </p>
          <p className="small d-soft">In the enquiry form, choose &quot;Other&quot; and tell us about your organisation in the notes.</p>
          <p className="d-soft">
            Are you an author or publisher? <Link href="/publish">Go to publish with {brand.name}</Link>.
          </p>
        </div>
      </section>

      <div className="wrap">
        <InfoFooter />
      </div>
    </main>
  );
}
