"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useOnboardingState } from "@/components/useDeviceState";
import { CHECKOUT_CONSENTS, CONSENT_REQUIRED_MESSAGE } from "@/lib/checkout-consent";
import { libraryPeek, type OfferPlan } from "@/lib/membership-offer";
import { trialDateLines } from "@/lib/membership-trial";
import { offerDue, updateOnboarding, type KeyValueStore } from "@/lib/onboarding";
import { READER_TERMS_LINKS, READER_TERMS_VERSION } from "@/lib/terms";
import { PlanToggle } from "./PlanToggle";

function local(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The membership offer inside onboarding (13.4). One screen, after the quiz
 * and the first exercise, never on a first visit, shown once. Everything a
 * reader needs to decide is on it together: the plan, the billing period,
 * the trial length, the price it renews at, the exact day the reminder email
 * arrives, the day the first payment is taken, how to cancel, and a way to
 * say no. The library it unlocks is shown beside it, starting with the titles
 * the quiz suggested.
 *
 * It does not count down, does not say "free" about the trial, and shows no
 * struck-through price. Dismissing it is final.
 */
export function MembershipOffer({ plans, library }: { plans: OfferPlan[]; library: { slug: string; title: string; themeName: string | null }[] }) {
  const device = useOnboardingState();
  const [dismissed, setDismissed] = useState(false);
  const [plan, setPlan] = useState<OfferPlan["plan"]>(plans[0]?.plan ?? "monthly");
  const [agreed, setAgreed] = useState(false);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Dates are worked out from the moment the screen opens, in the browser, so "today" is the reader's today.
  const [now] = useState(() => new Date());

  // The server only renders this for a reader who is not a member and has a plan to buy.
  const due = !dismissed && offerDue(device, { isMember: false, plansOpen: plans.length > 0 });

  const chosen = plans.find((p) => p.plan === plan) ?? plans[0];
  const dates = useMemo(() => (chosen ? trialDateLines(now, chosen.trialDays) : null), [chosen, now]);
  const peek = useMemo(() => libraryPeek(library.map((l) => ({ ...l, isDemo: false, hasVersion: true })), device.suggested ?? []), [library, device.suggested]);

  if (!due || !chosen) return null;

  function dismiss() {
    updateOnboarding(local(), { offerDismissedAt: Date.now() });
    setDismissed(true);
  }

  async function start() {
    if (!chosen) return;
    if (!agreed) {
      setMissing(true);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/checkout/membership", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan: chosen.plan, terms: READER_TERMS_VERSION, consent: CHECKOUT_CONSENTS.membership.version }),
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (res.ok && body.url) {
        window.location.assign(body.url);
        return;
      }
      setMessage(body.error ?? "Checkout could not start just now. Please try again later.");
    } catch {
      setMessage("Checkout could not start just now. Please try again later.");
    }
    setBusy(false);
  }

  const every = chosen.plan === "monthly" ? "month" : "year";
  return (
    <section className="card membership-offer" aria-labelledby="offer-title">
      <h2 id="offer-title">Membership: every workbook in the library</h2>
      {peek.length ? (
        <ul className="offer-library" aria-label="Some of the library">
          {peek.map((t) => (
            <li key={t.slug}>
              <Link href={`/w/${t.slug}`}>{t.title}</Link>
              {t.themeName ? <span className="muted small"> {t.themeName}</span> : null}
            </li>
          ))}
          <li className="muted small">
            <Link href="/library">See the whole library</Link>
          </li>
        </ul>
      ) : null}

      <PlanToggle plans={plans} value={chosen.plan} onChange={setPlan} />

      <dl className="offer-terms" aria-label="The terms, together">
        <div>
          <dt>Plan</dt>
          <dd>{chosen.heading} membership</dd>
        </div>
        <div>
          <dt>Billing</dt>
          <dd>
            {chosen.line.billing}
          </dd>
        </div>
        {dates ? (
          <>
            <div>
              <dt>Trial</dt>
              <dd>{dates.days}. Nothing is taken today. A card is needed to start.</dd>
            </div>
            <div>
              <dt>Reminder email</dt>
              <dd>{dates.reminder}</dd>
            </div>
            <div>
              <dt>First payment</dt>
              <dd>
                {dates.firstPayment}, {chosen.renewal}
              </dd>
            </div>
          </>
        ) : (
          <div>
            <dt>Payment today</dt>
            <dd>{chosen.renewal}</dd>
          </div>
        )}
        <div>
          <dt>Renews at</dt>
          <dd>
            {chosen.renewal} each {every}, until you cancel
          </dd>
        </div>
        <div>
          <dt>To cancel</dt>
          <dd>
            Go to You, then Manage membership, then Cancel.{dates ? ` Cancel before ${dates.firstPayment} and you are not charged.` : ""}
          </dd>
        </div>
      </dl>
      <p className="muted small">Dates assume you start today.</p>

      <label className="paywall-check">
        <input type="checkbox" checked={agreed} disabled={busy} onChange={(e) => (setAgreed(e.currentTarget.checked), e.currentTarget.checked && setMissing(false))} aria-invalid={missing || undefined} />
        <span>{CHECKOUT_CONSENTS.membership.text}</span>
      </label>
      {missing ? (
        <p className="small form-error" role="alert">
          {CONSENT_REQUIRED_MESSAGE}
        </p>
      ) : null}

      <div className="offer-actions">
        <button type="button" className="btn" disabled={busy} onClick={() => void start()}>
          {dates ? `Start the ${dates.days} trial` : "Join the membership"}
        </button>
        <button type="button" className="btn secondary" disabled={busy} onClick={dismiss}>
          No thanks
        </button>
      </div>
      <p className="small muted">
        By continuing to payment you agree to our{" "}
        {READER_TERMS_LINKS.map((l, i) => (
          <span key={l.href}>
            {i === 0 ? "" : i === READER_TERMS_LINKS.length - 1 ? " and " : ", "}
            <a href={l.href} target="_blank" rel="noopener">
              {l.label}
            </a>
          </span>
        ))}
        .
      </p>
      {message ? (
        <p className="muted" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
