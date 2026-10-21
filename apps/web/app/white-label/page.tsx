import type { Metadata } from "next";
import Link from "next/link";
import { InfoFooter } from "@/components/InfoFooter";
import { DHero } from "@/components/info/DHero";
import { brand } from "@/lib/brand";
import { ENQUIRY_HREF } from "@/lib/plans";

/**
 * White-label sites (F-009). A publisher's own branded site on the Akana
 * platform. No plan names or prices until Crent sets them: "talk to us"
 * goes to the enquiry form on /publish, where "Our own branded site" is one
 * of the interest options.
 */
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Your own branded site",
  description: `Run your list of workbooks on a site under your own name, built and hosted by ${brand.name}.`,
  alternates: { canonical: "/white-label" },
};

const SAME = [
  "The same guided workbook player readers use on the marketplace",
  "Answers private to the reader. Nobody else can read them, including you and us",
  "Help now on every screen of a wellbeing workbook, which you cannot switch off",
  "Adults only, with the same consent before health information is stored",
  "No ad pixels or third-party trackers",
] as const;

const YOURS = [
  "Your name, logo and colours",
  "Your own catalogue, chosen from the workbooks you publish",
  "Your own web address",
] as const;

export default function WhiteLabelPage() {
  return (
    <main className="d-page">
      <DHero
        eyebrow="For publishers"
        title="Your own branded site"
        lead={`Run your list of workbooks on a site under your own name. ${brand.name} builds, hosts and maintains it on the same platform as the marketplace. The reading experience stays the same.`}
      >
        <p className="d-actions">
          <Link className="btn" href={ENQUIRY_HREF}>
            Talk to us
          </Link>
          <Link className="btn secondary" href="/publish">
            How publishing works
          </Link>
        </p>
      </DHero>

      <section className="d-section" aria-label="What is yours and what stays the same">
        <div className="wrap d-cards d-cards-2">
          <section className="d-card d-card-roomy" aria-labelledby="wl-yours">
            <h2 id="wl-yours">What is yours</h2>
            <ul className="d-list">
              {YOURS.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </section>
          <section className="d-card d-card-roomy" aria-labelledby="wl-same">
            <h2 id="wl-same">What stays the same</h2>
            <ul className="d-list">
              {SAME.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </section>
        </div>
      </section>

      <section className="d-band" aria-labelledby="wl-plans">
        <div className="wrap d-stack-s">
          <h2 id="wl-plans">Plans and prices</h2>
          <p>
            We are setting up the first branded sites with publishers now. Plans and prices are not set yet, so we agree them with each
            publisher. Tell us about your list and what you need.
          </p>
          <p className="d-actions">
            <Link className="btn" href={ENQUIRY_HREF}>
              Talk to us
            </Link>
          </p>
          <p className="small d-soft">In the enquiry form, choose &quot;Our own branded site&quot;.</p>
        </div>
      </section>

      <div className="wrap">
        <InfoFooter />
      </div>
    </main>
  );
}
