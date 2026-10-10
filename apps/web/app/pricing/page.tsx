import type { Metadata } from "next";
import Link from "next/link";
import { InfoFooter } from "@/components/InfoFooter";
import { brand } from "@/lib/brand";
import { ENQUIRY_HREF, membershipDisplay, sharedPlanDisplay, type PricePointRowLike } from "@/lib/plans";
import { sharedPlanOffer } from "@/lib/shared-membership";
import { trialLabel } from "@/lib/membership-trial";
import { loadTrialConfig } from "@/lib/membership-trial-server";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Pricing (F-009). Readers see the membership price from public.price_points
 * (interim figures until Crent sets them) and "Price to be confirmed" for
 * anything without a decided figure. Publishers, white-label sites and
 * organisations have no plans yet, so each says "talk to us" and links to
 * the enquiry form on /publish.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pricing",
  description: `How ${brand.name} membership and workbooks are priced, and how publishers and organisations work with us.`,
  alternates: { canonical: "/pricing" },
};

async function membershipRows(): Promise<PricePointRowLike[]> {
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase
      .from("price_points")
      .select("id, kind, amounts, stripe_price_id, active")
      .in("id", ["member_month", "member_year", "member_two_month"]);
    if (error) throw new Error(error.message);
    return (data ?? []) as PricePointRowLike[];
  } catch (err) {
    console.error("pricing: price_points read failed", err instanceof Error ? err.message : err);
    return [];
  }
}

export default async function PricingPage() {
  const rows = await membershipRows();
  const m = membershipDisplay(rows);
  // Hook point (item 6.1): the two-person offer, shown only while the plan can be bought.
  const sharedOffer = sharedPlanOffer("pricing");
  const sharedPrice = sharedPlanDisplay(rows);
  // 13.5: the trial lengths come from settings, so this page says what checkout does.
  const trial = await loadTrialConfig();
  return (
    <main className="wrap info-page">
      <header className="info-head">
        <p className="eyebrow muted">{brand.name}</p>
        <h1>Pricing</h1>
        <p className="info-lead">
          Plain prices. The first unit of a workbook is free to read, with no card, before you decide.{" "}
          {trial.monthly > 0 || trial.yearly > 0
            ? "Membership starts with a trial. A card is needed to start it, nothing is taken until the first payment date, and we email you a reminder three days before."
            : "Membership starts when you join and renews until you cancel."}
        </p>
      </header>

      <section className="info-section" aria-labelledby="pricing-readers">
        <h2 id="pricing-readers">For readers</h2>
        <div className="info-plans">
          <div className="card info-plan">
            <h3>Membership</h3>
            <p className="info-price">{m.monthly}</p>
            {trial.monthly > 0 && m.monthly.endsWith(" a month") ? <p className="small muted">Monthly plan: {trialLabel("monthly", trial.monthly, m.monthly.replace(/ a month$/, ""))}.</p> : null}
            <p className="info-price">{m.yearly}</p>
            {trial.yearly > 0 ? <p className="small muted">The annual plan starts with a {trial.yearly}-day trial, then is charged once a year.</p> : null}
            <p className="muted">
              Opens every workbook included in membership. Renews until you cancel. Cancel within 14 days of starting, or of a yearly
              renewal, and the unused days are refunded.
            </p>
            {m.hasPrice ? <p className="small muted">UK prices, VAT included. These prices may change before launch.</p> : null}
          </div>
          {sharedOffer && sharedPrice ? (
            <div className="card info-plan" id="two-people">
              <h3>{sharedOffer.headline}</h3>
              <p className="info-price">{sharedPrice}</p>
              <p className="muted">{sharedOffer.body}</p>
              <p className="small muted">
                One person pays and owns the membership. The second person joins from a link you send them, through your own message or
                email, and needs an {brand.name} account. If you cancel, you both lose access at the end of the period you have paid for.{" "}
                <Link href="/library">Start from any workbook in the library.</Link>
              </p>
            </div>
          ) : null}
          <div className="card info-plan">
            <h3>Single workbooks</h3>
            <p className="info-price">Price to be confirmed</p>
            <p className="muted">Buy one workbook and keep it. Each workbook page will show its price once it is set. The first unit is free to read.</p>
          </div>
        </div>
        <p className="small">
          Demo workbooks are examples and cannot be bought. See <Link href="/help/membership">membership</Link>,{" "}
          <Link href="/help/cancelling">cancelling</Link> and the <Link href="/legal/refunds">refund policy</Link>.
        </p>
      </section>

      <section className="info-section" aria-labelledby="pricing-business">
        <h2 id="pricing-business">For authors, publishers and organisations</h2>
        <p>Plans for these are not set yet. Tell us what you need and we will talk it through.</p>
        <div className="info-plans">
          <div className="card info-plan">
            <h3>Publish on the marketplace</h3>
            <p className="muted">Your book as a workbook in the {brand.name} library. Nothing to pay up front. You are paid a share of what it earns.</p>
            <Link className="btn secondary" href="/publish">
              How publishing works
            </Link>
          </div>
          <div className="card info-plan">
            <h3>Your own branded site</h3>
            <p className="muted">Your list on a site under your own name, built and hosted by {brand.name}.</p>
            <Link className="btn secondary" href="/white-label">
              About branded sites
            </Link>
          </div>
          <div className="card info-plan">
            <h3>{brand.name} for organisations</h3>
            <p className="muted">Workbooks for your staff or members, with answers kept private from you.</p>
            <Link className="btn secondary" href="/organisations">
              About organisations
            </Link>
          </div>
        </div>
        <p>
          <Link className="btn" href={ENQUIRY_HREF}>
            Talk to us
          </Link>
        </p>
      </section>

      <InfoFooter />
    </main>
  );
}
