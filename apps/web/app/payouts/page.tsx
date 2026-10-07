import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ConnectPayoutsButton } from "@/components/payouts/ConnectPayoutsButton";
import { PayoutStatusBadge } from "@/components/payouts/PayoutStatusBadge";
import { getPayoutOrganisations, getStepUpState, type PayoutOrganisation } from "@/lib/payouts/read";
import { PAYOUT_STATUS_COPY, payoutErrorMessage } from "@/lib/payouts/status";
import { saveTaxDetails } from "./actions";

export const metadata: Metadata = {
  title: "Payouts",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

/**
 * Payouts for authors and publishers (F-099, F-143). Shows each
 * organisation where the person is owner or finance: the payout status,
 * the button to Stripe, and the tax details. Changing anything needs an
 * authenticator code from the last ten minutes. Apex host only (proxy).
 */
export default async function PayoutsPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);

  const stepUp = await getStepUpState();
  if (!stepUp.signedIn) redirect("/sign-in?next=/payouts");
  const orgs = await getPayoutOrganisations();

  const error = one("error");
  const notice =
    one("saved") === "1"
      ? "Saved. We have emailed the owner and finance contacts to let them know."
      : one("done") === "1"
        ? "Thanks. Your payout status is below. Stripe may take a day or two to finish its checks."
        : one("expired") === "1"
          ? "That Stripe link expired. Press the button again to carry on where you left off."
          : one("held") === "1"
            ? PAYOUT_STATUS_COPY.held.detail
            : null;

  return (
    <main className="wrap payouts-page">
      <p className="eyebrow muted">Authors and publishers</p>
      <h1>Payouts</h1>
      <p className="muted">
        Akana sells your workbooks and pays you each month through Stripe. Stripe holds your bank details. We keep only whether your account is ready.
      </p>

      {notice ? (
        <p className="payouts-notice card" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="form-error payouts-error" role="alert">
          {error === "tax_invalid" ? "Choose your tax residence, answer the treaty question and tick the confirmation." : error === "stripe" ? "Stripe did not answer. Nothing was changed. Try again in a moment." : payoutErrorMessage(error)}
        </p>
      ) : null}

      {orgs.length === 0 ? (
        <section className="card payouts-empty">
          <h2>Nothing to set up here</h2>
          <p>Payouts are managed by the owner or finance contact of an organisation. If that should be you, ask the owner to change your role.</p>
        </section>
      ) : (
        orgs.map((o) => <OrganisationPayouts key={o.orgId} org={o} recent={stepUp.recent} />)
      )}

      <section className="payouts-security">
        <h2>Keeping your payouts safe</h2>
        <p>
          Before anyone changes where money goes, we ask for a code from their authenticator app. Every change is recorded, and every owner and finance contact gets an email.
        </p>
        <p className="muted small">
          Lost your authenticator? Contact Akana support. We check who you are before we reset it, and payouts wait until we have.
        </p>
      </section>
    </main>
  );
}

function OrganisationPayouts({ org, recent }: { org: PayoutOrganisation; recent: boolean }) {
  return (
    <section className="card payouts-org" aria-labelledby={`org-${org.orgId}`}>
      <h2 id={`org-${org.orgId}`}>{org.displayName}</h2>
      {org.exempt ? (
        <p className="muted">This organisation is not paid through Stripe.</p>
      ) : (
        <>
          <PayoutStatusBadge status={org.status} showDetail />
          {org.canManage && org.status !== "held" ? (
            <div className="payouts-actions">
              <ConnectPayoutsButton orgId={org.orgId} status={org.status} />
              {!recent ? <p className="muted small">We will ask for a code from your authenticator app first.</p> : null}
            </div>
          ) : null}
          {!org.country ? <p className="muted small">Your organisation has no country yet. Contact support to add it before you connect payouts.</p> : null}
          <TaxDetails org={org} recent={recent} />
        </>
      )}
    </section>
  );
}

function TaxDetails({ org, recent }: { org: PayoutOrganisation; recent: boolean }) {
  const summary = org.taxResidence
    ? `Tax residence ${org.taxResidence}. Treaty benefits ${org.treatyClaimed ? "claimed" : "not claimed"}.`
    : "Not given yet.";
  return (
    <div className="payouts-tax" id={`tax-${org.orgId}`}>
      <h3>Tax details</h3>
      <p>{summary}</p>
      {!org.canManage ? null : !recent ? (
        <p>
          <Link className="btn secondary" href={`/payouts/verify?next=${encodeURIComponent(`/payouts#tax-${org.orgId}`)}`}>
            Verify to change tax details
          </Link>
        </p>
      ) : (
        <form action={saveTaxDetails} className="payouts-tax-form">
          <input type="hidden" name="org" value={org.orgId} />
          <label htmlFor={`res-${org.orgId}`}>Country where you are resident for tax</label>
          <p className="muted small" id={`res-hint-${org.orgId}`}>
            Two letters, for example GB, IE or US.
          </p>
          <input
            id={`res-${org.orgId}`}
            name="tax_residence"
            type="text"
            inputMode="text"
            autoComplete="country"
            pattern="[A-Za-z]{2}"
            maxLength={2}
            required
            defaultValue={org.taxResidence ?? ""}
            aria-describedby={`res-hint-${org.orgId}`}
          />
          <fieldset>
            <legend>Do you claim tax treaty benefits between your country and the UK?</legend>
            <label className="payouts-choice">
              <input type="radio" name="treaty" value="yes" defaultChecked={org.treatyClaimed === true} required /> Yes
            </label>
            <label className="payouts-choice">
              <input type="radio" name="treaty" value="no" defaultChecked={org.treatyClaimed === false} /> No
            </label>
          </fieldset>
          <label className="payouts-choice">
            <input type="checkbox" name="confirm" value="yes" required /> I confirm these details are correct
          </label>
          <p className="muted small">If you are not sure, ask your accountant. You can change this later.</p>
          <button type="submit" className="btn">
            Save tax details
          </button>
        </form>
      )}
    </div>
  );
}
