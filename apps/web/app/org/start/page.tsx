import type { Metadata } from "next";
import Link from "next/link";
import { getReaderSession } from "@/lib/auth";
import { brand } from "@/lib/brand";
import { billingNotice, orgPriceId, SELF_SERVE_BOUNDS, TALK_TO_US } from "@/lib/org-billing";
import { orgPrivacyLine } from "@/lib/org-pilot";
import { createUserClient } from "@/lib/supabase/server";
import { attendanceRangeText, churchBands, groupLicenceCard, monthlyEquivalent, PILOT_AND_REFUND_TEXT, priceOf, SMALL_ORG_PLAN, smallOrgCard, churchCard } from "@/lib/org-plans";
import { loadPackTitles, loadPlanPrices } from "@/lib/org-plans-server";
import { startChurch, startGroupLicence, startSignup, startSmallOrg } from "./actions";

export const metadata: Metadata = { title: "Start an organisation", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Self-serve sign-up for a Group or a small Teams plan (F-226). Behind the
 * org_self_serve feature flag, off until Crent sets prices. While it is
 * off, or a plan has no price id, this page says "Talk to us" and offers
 * nothing to buy. No price is ever written here: Stripe Checkout shows it.
 */
export default async function OrgStartPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const supabase = await createUserClient();
  const { data: open } = await supabase.rpc("org_self_serve_open");
  const groupPriced = orgPriceId("group_member_month") !== null;
  const teamsPriced = orgPriceId("teams_seat_month") !== null || orgPriceId("teams_seat_year") !== null;
  const prices = await loadPlanPrices();
  const small = smallOrgCard(prices);
  const smallPrice = priceOf(prices, SMALL_ORG_PLAN);
  const churches = churchBands(prices);
  const licence = groupLicenceCard(prices);
  const anyPriced = groupPriced || teamsPriced || small !== null || churches.length > 0 || licence !== null;

  if (one(sp.done) === "group") {
    return (
      <section className="card auth-card">
        <h1>Thank you</h1>
        <p>Your group licence is being set up. It takes a minute. Then you can hand out your six places from your console.</p>
        <p>
          <Link className="btn" href="/org">
            Go to your console
          </Link>
        </p>
      </section>
    );
  }

  if (one(sp.done) === "1") {
    return (
      <section className="card auth-card">
        <h1>Thank you</h1>
        <p>Your organisation is being set up. It takes a minute. Then you can invite people from your console.</p>
        <p>
          <Link className="btn" href="/org">
            Go to your console
          </Link>
        </p>
      </section>
    );
  }

  if (open !== true || !anyPriced) {
    return (
      <section className="card auth-card">
        <h1>{brand.name} for organisations</h1>
        <p>{orgPrivacyLine(brand.name)}</p>
        <p>Sign-up for groups and teams is not open yet. {TALK_TO_US} and we will set you up.</p>
        <p>
          <Link className="btn" href="/contact">
            {TALK_TO_US}
          </Link>
        </p>
      </section>
    );
  }

  const session = await getReaderSession();
  const titles = session && licence ? await loadPackTitles() : [];
  const err = one(sp.e);
  const notice = err === "invalid" ? "Check the form. Something is missing or does not fit." : err === "limited" ? "Too many tries. Please wait an hour." : billingNotice(err)?.text;

  return (
    <section className="card auth-card org-start">
      <h1>Start a group or a team</h1>
      <p>{orgPrivacyLine(brand.name)}</p>
      {notice ? (
        <p className="form-error" role="alert">
          {notice}
        </p>
      ) : null}
      {!session ? (
        <p>
          <Link className="btn" href={`/sign-in?next=${encodeURIComponent("/org/start")}`}>
            Sign in or create an account first
          </Link>
        </p>
      ) : !(groupPriced || teamsPriced) ? null : (
        <form className="admin-form" action={startSignup}>
          <fieldset>
            <legend>Plan</legend>
            {groupPriced ? (
              <div className="check">
                <input id="plan-group" name="plan" type="radio" value="group_member_month" required />
                <label htmlFor="plan-group">
                  Group: a book club or peer group, {SELF_SERVE_BOUNDS.group.min} to {SELF_SERVE_BOUNDS.group.max} people, paid monthly by you
                </label>
              </div>
            ) : (
              <p className="muted small">Groups: {TALK_TO_US.toLowerCase()}.</p>
            )}
            {orgPriceId("teams_seat_month") ? (
              <div className="check">
                <input id="plan-teams-m" name="plan" type="radio" value="teams_seat_month" />
                <label htmlFor="plan-teams-m">
                  Small team, {SELF_SERVE_BOUNDS.teams.min} to {SELF_SERVE_BOUNDS.teams.max} seats, monthly
                </label>
              </div>
            ) : null}
            {orgPriceId("teams_seat_year") ? (
              <div className="check">
                <input id="plan-teams-y" name="plan" type="radio" value="teams_seat_year" />
                <label htmlFor="plan-teams-y">
                  Small team, {SELF_SERVE_BOUNDS.teams.min} to {SELF_SERVE_BOUNDS.teams.max} seats, yearly
                </label>
              </div>
            ) : null}
          </fieldset>
          <label htmlFor="org-kind">What are you?</label>
          <select id="org-kind" name="org_kind" required defaultValue="">
            <option value="" disabled>
              Choose one
            </option>
            <option value="community_group">A group (for the Group plan)</option>
            <option value="business">A business (for a team)</option>
            <option value="charity">A charity (for a team)</option>
          </select>
          <label htmlFor="org-name">Name of your group or organisation</label>
          <input id="org-name" name="name" maxLength={120} required autoComplete="organization" />
          <label htmlFor="org-qty">How many people, including you</label>
          <input id="org-qty" name="quantity" type="number" inputMode="numeric" min={2} max={25} required />
          <div className="check">
            <input id="org-adult" name="adult" type="checkbox" value="yes" required />
            <label htmlFor="org-adult">Everyone taking part, including me, is 18 or over</label>
          </div>
          <div className="check">
            <input id="org-auto-seat" name="auto_seat" type="checkbox" value="yes" />
            <label htmlFor="org-auto-seat">Give me one of the places too, so I can use the workbooks myself</label>
          </div>
          <p className="muted small">Leave this unticked if you are only organising. You can take a place later with a join link.</p>
          <div className="check">
            <input id="org-renews" name="renews" type="checkbox" value="yes" required />
            <label htmlFor="org-renews">I understand this renews each period until I cancel, and I can cancel from the Billing page</label>
          </div>
          <p className="muted small">You pay on the next page, run by Stripe. You see the price there before you pay. You become the owner of the account.</p>
          <p className="muted small">
            If you are paying for a group yourself, you can cancel within 14 days of starting and get back the days you have not used. We remind you of the
            price and how to cancel before renewals. Cancel any time from Billing.
          </p>
          <button type="submit" className="btn">
            Continue to payment
          </button>
        </form>
      )}
      {session && small && smallPrice ? (
        <form className="admin-form" action={startSmallOrg} aria-labelledby="small-h">
          <h2 id="small-h">{small.heading}</h2>
          <p>
            {small.primary}. {small.secondary}.
          </p>
          <ul className="small">
            {small.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <label htmlFor="so-kind">What are you?</label>
          <select id="so-kind" name="org_kind" required defaultValue="">
            <option value="" disabled>
              Choose one
            </option>
            <option value="business">A business</option>
            <option value="charity">A charity</option>
          </select>
          <label htmlFor="so-name">Name of your organisation</label>
          <input id="so-name" name="name" maxLength={120} required autoComplete="organization" />
          <label htmlFor="so-seats">Seats, including you</label>
          <input id="so-seats" name="seats" type="number" inputMode="numeric" min={smallPrice.minSeats ?? 5} max={smallPrice.maxSeats ?? 50} required />
          <div className="check">
            <input id="so-adult" name="adult" type="checkbox" value="yes" required />
            <label htmlFor="so-adult">Everyone taking part, including me, is 18 or over</label>
          </div>
          <div className="check">
            <input id="so-auto" name="auto_seat" type="checkbox" value="yes" />
            <label htmlFor="so-auto">Give me one of the seats too</label>
          </div>
          <div className="check">
            <input id="so-renews" name="renews" type="checkbox" value="yes" required />
            <label htmlFor="so-renews">I understand this renews each year until I cancel</label>
          </div>
          <p className="muted small">{PILOT_AND_REFUND_TEXT.small}</p>
          <button type="submit" className="btn">
            Continue to payment
          </button>
        </form>
      ) : null}
      {session && churches.length > 0 ? (
        <form className="admin-form" action={startChurch} aria-labelledby="church-h">
          <h2 id="church-h">Church</h2>
          <p>Every member can have a place. You choose the band that fits your usual Sunday attendance.</p>
          <fieldset>
            <legend>Usual attendance</legend>
            {churches.map((b) => {
              const card = churchCard(b);
              return (
                <div className="check" key={b.id}>
                  <input id={`ch-${b.id}`} name="band" type="radio" value={b.id} required />
                  <label htmlFor={`ch-${b.id}`}>
                    {attendanceRangeText(b)} people: {card.primary} ({monthlyEquivalent(b.amountMinor, b.currency)} a month, paid yearly)
                  </label>
                </div>
              );
            })}
          </fieldset>
          <label htmlFor="ch-name">Name of your church</label>
          <input id="ch-name" name="name" maxLength={120} required autoComplete="organization" />
          <div className="check">
            <input id="ch-declared" name="declared" type="checkbox" value="yes" required />
            <label htmlFor="ch-declared">I confirm this band is a fair account of our usual attendance</label>
          </div>
          <div className="check">
            <input id="ch-adult" name="adult" type="checkbox" value="yes" required />
            <label htmlFor="ch-adult">Everyone taking part, including me, is 18 or over</label>
          </div>
          <div className="check">
            <input id="ch-auto" name="auto_seat" type="checkbox" value="yes" />
            <label htmlFor="ch-auto">Give me a place too</label>
          </div>
          <div className="check">
            <input id="ch-renews" name="renews" type="checkbox" value="yes" required />
            <label htmlFor="ch-renews">I understand this renews each year until I cancel</label>
          </div>
          <button type="submit" className="btn">
            Continue to payment
          </button>
        </form>
      ) : null}
      {session && licence && titles.length > 0 ? (
        <form className="admin-form" action={startGroupLicence} aria-labelledby="gl-h">
          <h2 id="gl-h">{licence.heading}</h2>
          <p>{licence.primary}.</p>
          <ul className="small">
            {licence.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <label htmlFor="gl-wb">Workbook</label>
          <select id="gl-wb" name="workbook" required defaultValue="">
            <option value="" disabled>
              Choose one
            </option>
            {titles.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          <label htmlFor="gl-name">Name of your group</label>
          <input id="gl-name" name="name" maxLength={120} autoComplete="organization" />
          <div className="check">
            <input id="gl-adult" name="adult" type="checkbox" value="yes" required />
            <label htmlFor="gl-adult">Everyone taking part, including me, is 18 or over</label>
          </div>
          <button type="submit" className="btn">
            Continue to payment
          </button>
        </form>
      ) : null}
    </section>
  );
}
