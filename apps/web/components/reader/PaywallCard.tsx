"use client";

import { useRef, useState } from "react";
import { trialDateLines } from "@/lib/membership-trial";
import { CHECKOUT_CONSENTS, CONSENT_REQUIRED_MESSAGE, type CheckoutConsentKind } from "@/lib/checkout-consent";
import { READER_TERMS_LINKS, READER_TERMS_VERSION } from "@/lib/terms";
import type { PaywallState } from "./paywall";

interface Props {
  state: Exclude<PaywallState, { kind: "open" }>;
  slug: string;
  /** "8 weeks" */
  fullLength: string;
  unitWord: string;
}

/**
 * The calm paywall card (F-019). Takes the place of a unit the reader's
 * entitlement does not cover. No countdown, no scarcity, no "only today".
 * The Toolkit tab and Help now stay where they are; this card only fills
 * the unit.
 *
 * Before either checkout the reader ticks an unticked box carrying the
 * immediate-access wording from the refund policy: for a workbook, that
 * access starts now and ends the 14-day right to cancel; for membership,
 * that cancelling within 14 days gives a pro rata refund. The version they
 * ticked goes to the route, which refuses without it and records it (0019).
 */
export function PaywallCard({ state, slug, fullLength, unitWord }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [agreed, setAgreed] = useState<Record<CheckoutConsentKind, boolean>>({ workbook: false, membership: false });
  const [missing, setMissing] = useState<CheckoutConsentKind | null>(null);
  const boxes = { workbook: useRef<HTMLInputElement>(null), membership: useRef<HTMLInputElement>(null) };

  function tick(kind: CheckoutConsentKind, on: boolean) {
    setAgreed((a) => ({ ...a, [kind]: on }));
    if (on && missing === kind) setMissing(null);
  }

  /** The consent must be ticked before payment starts. Says so, and moves focus to the box, when it is not. */
  function consented(kind: CheckoutConsentKind): boolean {
    if (agreed[kind]) return true;
    setMessage(null);
    setMissing(kind);
    boxes[kind].current?.focus();
    return false;
  }

  // One path for both checkouts: the single workbook and the membership (F-097).
  async function start(url: string, payload: Record<string, string>) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        // F-122: the reader terms version this card links to, recorded at checkout.
        body: JSON.stringify({ ...payload, terms: READER_TERMS_VERSION }),
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

  const buy = () => {
    if (consented("workbook")) void start("/api/checkout", { workbook: slug, consent: CHECKOUT_CONSENTS.workbook.version });
  };
  const join = (plan: "monthly" | "yearly" | "two_monthly") => {
    if (consented("membership")) void start("/api/checkout/membership", { plan, workbook: slug, consent: CHECKOUT_CONSENTS.membership.version });
  };

  const offer = state.kind === "offer" ? state : null;
  // 13.5: the exact dates, from the moment the card is on screen (this card only renders in the browser).
  const trialLines = offer?.trialDays ? trialDateLines(new Date(), offer.trialDays) : null;
  const consentKinds: { kind: CheckoutConsentKind; heading: string }[] = [];
  if (offer?.buy.enabled) consentKinds.push({ kind: "workbook", heading: "If you buy this workbook" });
  if (offer && (offer.membership.enabled || offer.yearly || offer.shared)) consentKinds.push({ kind: "membership", heading: "If you join the membership" });

  return (
    <div className="paywall-card" role="note" aria-labelledby="paywall-title">
      <h3 id="paywall-title">This {unitWord} opens with the full workbook.</h3>
      <p>The full workbook includes all {fullLength}.</p>

      {state.kind === "demo" ? (
        <p className="muted">{state.message}</p>
      ) : (
        <>
          <p>Everything you have written so far carries over into it.</p>
          <p className="muted">Your free {unitWord} and your answers stay here whatever you decide.</p>
          {consentKinds.length ? (
            <fieldset className="paywall-consent">
              <legend>Before you pay</legend>
              {consentKinds.map(({ kind, heading }) => (
                <div key={kind} className="paywall-consent-item">
                  <label className="paywall-check">
                    <input
                      ref={boxes[kind]}
                      type="checkbox"
                      name={`consent-${kind}`}
                      checked={agreed[kind]}
                      disabled={busy}
                      onChange={(e) => tick(kind, e.currentTarget.checked)}
                      aria-describedby={missing === kind ? `paywall-consent-${kind}-error` : undefined}
                      aria-invalid={missing === kind ? true : undefined}
                    />
                    <span>
                      <strong>{heading}.</strong> {CHECKOUT_CONSENTS[kind].text}
                    </span>
                  </label>
                  {missing === kind ? (
                    <p id={`paywall-consent-${kind}-error`} className="small form-error paywall-consent-error" role="alert">
                      {CONSENT_REQUIRED_MESSAGE}
                    </p>
                  ) : null}
                </div>
              ))}
            </fieldset>
          ) : null}
          <div className="paywall-actions">
            <button type="button" className="btn" disabled={!state.buy.enabled || busy} onClick={state.buy.enabled ? buy : undefined}>
              <span>{state.buy.label}</span>
              <span className="paywall-note">{state.buy.note}</span>
            </button>
            <button
              type="button"
              className="btn secondary"
              disabled={!state.membership.enabled || busy}
              onClick={state.membership.enabled ? () => join("monthly") : undefined}
            >
              <span>{state.membership.label}</span>
              <span className="paywall-note">{state.membership.note}</span>
            </button>
          </div>
          {trialLines ? (
            <p className="small muted paywall-trial">
              If you join the membership today: the trial lasts {trialLines.days}, nothing is taken today, we email you a reminder on {trialLines.reminder}, and the first payment is on {trialLines.firstPayment}. To cancel, go to You, then Manage membership.
            </p>
          ) : null}
          {state.yearly ? (
            <p className="small">
              <button type="button" className="paywall-yearly" disabled={busy} onClick={() => join("yearly")}>
                {state.yearly.label}
              </button>
            </p>
          ) : null}
          {state.shared ? (
            <p className="small paywall-shared">
              {state.shared.positioning}.{" "}
              <button type="button" className="paywall-yearly" disabled={busy} onClick={() => join("two_monthly")}>
                {state.shared.label}
              </button>
            </p>
          ) : null}
          {state.currencyNote ? <p className="small muted paywall-currency">{state.currencyNote}</p> : null}
          <p className="small muted paywall-terms">
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
        </>
      )}
    </div>
  );
}
