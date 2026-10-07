import type { Metadata } from "next";
import Link from "next/link";
import { InfoFooter } from "@/components/InfoFooter";
import { brand } from "@/lib/brand";
import { ENQUIRY_HREF, membershipDisplay, type PricePointRowLike } from "@/lib/plans";
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
      .in("id", ["member_month", "member_year"]);
    if (error) throw new Error(error.message);
    return (data ?? []) as PricePointRowLike[];
  } catch (err) {
    console.error("pricing: price_points read failed", err instanceof Error ? err.message : err);
    return [];
  }
}

export default async function PricingPage() {
  const m = membershipDisplay(await membershipRows());
  return (
    <main className="wrap info-page">
      <header className="info-head">
        <p className="eyebrow muted">{brand.name}</p>
        <h1>Pricing</h1>
        <p className="info-lead">Plain prices. No free trial that turns into a charge. The first unit of a workbook is free to read before you decide.</p>
      </header>

      <section className="info-section" aria-labelledby="pricing-readers">
        <h2 id="pricing-readers">For readers</h2>
        <div className="info-plans">
          <div className="card info-plan">
            <h3>Membership</h3>
            <p className="info-price">{m.monthly}</p>
            <p className="info-price">{m.yearly}</p>
            <p className="muted">
              Opens every workbook included in membership. Renews until you cancel. Cancel within 14 days of starting, or of a yearly
              renewal, and the unused days are refunded.
            </p>
            {m.hasPrice ? <p className="small muted">UK prices, VAT included. These prices may change before launch.</p> : null}
          </div>
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
