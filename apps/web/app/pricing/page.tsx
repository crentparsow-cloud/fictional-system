import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/lib/brand";
import { TrustStrip } from "@/components/TrustStrip";
import { membershipPlansOpen } from "@/lib/membership";
import { ENQUIRY_HREF, type PricePointRowLike } from "@/lib/plans";
import { FAQ, WHICH_TO_PICK, planCards } from "@/lib/pricing-page";
import { sharedPlanOpen, sharedYearlyPlanOpen } from "@/lib/shared-membership";
import { loadTrialConfig } from "@/lib/membership-trial-server";
import { siteProof } from "@/lib/social-proof-server";
import { studentEnabled } from "@/lib/student";
import { MARKETPLACE_TENANT_ID } from "@/lib/tenant";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Pricing (F-009). Readers see the membership price from public.price_points
 * (decided 15 October 2026) and "Price to be confirmed" for
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
      .in("id", ["member_month", "member_year", "member_two_month", "member_two_year"]);
    if (error) throw new Error(error.message);
    return (data ?? []) as PricePointRowLike[];
  } catch (err) {
    console.error("pricing: price_points read failed", err instanceof Error ? err.message : err);
    return [];
  }
}

export default async function PricingPage() {
  const rows = await membershipRows();
  const trial = await loadTrialConfig();
  const cards = planCards({ rows, trial, sharedOpen: sharedPlanOpen(), sharedYearlyOpen: sharedYearlyPlanOpen(), open: membershipPlansOpen() });
  const proof = await siteProof(MARKETPLACE_TENANT_ID).catch(() => null);
  const anyMembership = cards.some((c) => c.id !== "workbook");
  return (
    <main className="b-pricing">
      <header className="b-band-hero">
        <div className="wrap b-centre">
          <h1>Pick what suits you. Start free.</h1>
          <p className="b-lead">Plain prices, VAT included. Week 1 of any workbook is free to read, with no card, before you decide.</p>
          {proof ? <p className="b-small">{proof}</p> : null}
        </div>
      </header>

      <div className="wrap b-pbody">
        <section aria-labelledby="pricing-readers">
          <h2 id="pricing-readers" className="b-sr">
            For readers
          </h2>
          <div className="b-plans">
            {cards.map((c) => (
              <div className={`b-plan${c.badge ? " b-plan-hi" : ""}`} key={c.id} id={c.id === "two" ? "two-people" : undefined}>
                {c.badge ? <p className="b-plan-badge">{c.badge}</p> : null}
                <h3>{c.heading}</h3>
                <p className="b-plan-price">
                  <span>{c.primary}</span>
                  {c.secondary ? <span>{c.secondary}</span> : null}
                </p>
                <p className="b-plan-line">{c.billing}</p>
                <ul className="b-inc">
                  {c.terms.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
                {c.href || c.checkout ? (
                  <Link className={c.badge ? "btn b-plan-btn" : "btn secondary b-plan-btn"} href={c.href ?? "/explore"}>
                    {c.id === "workbook" ? "Look at the library" : "Start from the library"}
                  </Link>
                ) : null}
              </div>
            ))}
            {!anyMembership ? (
              <div className="b-plan">
                <h3>Membership</h3>
                <p className="b-plan-price">
                  <span>Price to be confirmed</span>
                </p>
                <p className="b-plan-line">The membership price is not set yet.</p>
              </div>
            ) : null}
          </div>
          <p className="b-small b-centre-text">
            <Link href="/gift">Give a membership</Link>
            {studentEnabled() ? (
              <>
                {" "}
                or see the <Link href="/you/student">student price</Link>
              </>
            ) : null}
            . UK prices.
          </p>
          <TrustStrip kind="both" />
          <p className="b-small b-centre-text">
            Demo workbooks are examples and cannot be bought. See <Link href="/help/membership">membership</Link>, <Link href="/help/cancelling">cancelling</Link> and
            the <Link href="/legal/refunds">refund policy</Link>.
          </p>
        </section>

        <section className="b-psec" aria-labelledby="pricing-pick">
          <h2 id="pricing-pick">Which should I pick?</h2>
          <div className="b-pick">
            {WHICH_TO_PICK.map((w) => (
              <p key={w.label}>
                <strong>{w.label}.</strong> {w.text}
              </p>
            ))}
          </div>
        </section>

        <section className="b-psec b-faq" aria-labelledby="pricing-faq">
          <h2 id="pricing-faq">Questions people ask</h2>
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </section>

        <section className="b-psec" aria-labelledby="pricing-business">
          <h2 id="pricing-business">For authors, publishers and organisations</h2>
          <p className="b-soft">Plans for these are not set yet. Tell us what you need and we will talk it through.</p>
          <div className="b-plans b-plans-biz">
            <div className="b-plan">
              <h3>Publish on the marketplace</h3>
              <p className="b-plan-line">Your book as a workbook in the {brand.name} library. Nothing to pay up front. You are paid a share of what it earns.</p>
              <Link className="btn secondary b-plan-btn" href="/publish">
                How publishing works
              </Link>
            </div>
            <div className="b-plan">
              <h3>Your own branded site</h3>
              <p className="b-plan-line">Your list on a site under your own name, built and hosted by {brand.name}.</p>
              <Link className="btn secondary b-plan-btn" href="/white-label">
                About branded sites
              </Link>
            </div>
            <div className="b-plan">
              <h3>{brand.name} for organisations</h3>
              <p className="b-plan-line">Workbooks for your staff or members, with answers kept private from you.</p>
              <Link className="btn secondary b-plan-btn" href="/organisations">
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
      </div>

      <section className="b-band-hero b-close">
        <div className="wrap b-centre">
          <h2>Not sure yet?</h2>
          <p className="b-soft">Try week 1 of any workbook free.</p>
          <Link className="btn" href="/explore">
            Choose a book
          </Link>
        </div>
      </section>
    </main>
  );
}
