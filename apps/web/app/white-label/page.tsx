import type { Metadata } from "next";
import Link from "next/link";
import { InfoFooter } from "@/components/InfoFooter";
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
  "Answers sealed to the reader and to your site. Nobody else can read them, including you and us",
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
    <main className="wrap info-page">
      <header className="info-head">
        <p className="eyebrow muted">For publishers</p>
        <h1>Your own branded site</h1>
        <p className="info-lead">
          Run your list of workbooks on a site under your own name. {brand.name} builds, hosts and maintains it on the same platform as
          the marketplace.
        </p>
      </header>

      <div className="info-plans">
        <section className="card info-plan" aria-labelledby="wl-yours">
          <h2 id="wl-yours">What is yours</h2>
          <ul>
            {YOURS.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </section>
        <section className="card info-plan" aria-labelledby="wl-same">
          <h2 id="wl-same">What stays the same</h2>
          <ul>
            {SAME.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </section>
      </div>

      <section className="info-section" aria-labelledby="wl-plans">
        <h2 id="wl-plans">Plans and prices</h2>
        <p>
          We are setting up the first branded sites with publishers now. Plans and prices are not set yet, so we agree them with each
          publisher. Tell us about your list and what you need.
        </p>
        <p className="info-ctas">
          <Link className="btn" href={ENQUIRY_HREF}>
            Talk to us
          </Link>
          <Link className="btn secondary" href="/publish">
            How publishing works
          </Link>
        </p>
        <p className="small muted">In the enquiry form, choose &quot;Our own branded site&quot;.</p>
      </section>

      <InfoFooter />
    </main>
  );
}
