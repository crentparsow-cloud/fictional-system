"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { CHECKOUT_CONSENTS, CONSENT_REQUIRED_MESSAGE, type CheckoutConsentKind } from "@/lib/checkout-consent";
import { READER_TERMS_LINKS, READER_TERMS_VERSION } from "@/lib/terms";
import type { PaywallState } from "@/components/reader/paywall";

/** The sentences from paidLine() for a promotion code, one per thing on offer. Null where the code cannot apply. */
export interface PaidLines {
  workbook: string | null;
  monthly: string | null;
  yearly: string | null;
}

interface Props {
  /** The title on offer. Null on the /code page when only the membership is chosen. */
  slug: string | null;
  /** What is on offer, as the calm paywall works it out. Never "open" here. */
  state: Exclude<PaywallState, { kind: "open" }>;
  signedIn: boolean;
  /** Where sign-in brings the reader back to. A path on this site. */
  returnTo: string;
  /** Start: the free first unit. Null while the title has no published version. */
  start: { href: string; label: string } | null;
  /** The label for a title with no published version yet. Null hides the Start slot altogether. */
  outlineOnlyLabel: string | null;
  /** A promotion code the page has already checked with Stripe (item 5.9), carried into checkout. */
  code?: string | null;
  paidLines?: PaidLines | null;
}

/**
 * Working buttons for the public workbook page and the /code page (item
 * 3.2). The same checkout routes the reader's paywall card uses, the same
 * immediate-access consent before either, and the same words for a price
 * (F-094). Signed out, Buy and Join take the reader to sign in and back to
 * this page; the checkout routes need a reader to write the purchase row.
 *
 * A demo title shows Start and a line saying demo titles are not sold
 * (F-114). Nothing here counts down, strikes through a price or calls a
 * paid thing free.
 */
export function PublicBuy({ slug, state, signedIn, returnTo, start, outlineOnlyLabel, code, paidLines }: Props) {
  const showBuy = slug !== null;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [agreed, setAgreed] = useState<Record<CheckoutConsentKind, boolean>>({ workbook: false, membership: false });
  const [missing, setMissing] = useState<CheckoutConsentKind | null>(null);
  const boxes = { workbook: useRef<HTMLInputElement>(null), membership: useRef<HTMLInputElement>(null) };
  const signInHref = `/sign-in?next=${encodeURIComponent(returnTo)}`;

  function tick(kind: CheckoutConsentKind, on: boolean) {
    setAgreed((a) => ({ ...a, [kind]: on }));
    if (on && missing === kind) setMissing(null);
  }

  function consented(kind: CheckoutConsentKind): boolean {
    if (agreed[kind]) return true;
    setMessage(null);
    setMissing(kind);
    boxes[kind].current?.focus();
    return false;
  }

  async function go(url: string, payload: Record<string, string>) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, terms: READER_TERMS_VERSION, ...(code ? { code } : {}) }),
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
    if (slug && consented("workbook")) void go("/api/checkout", { workbook: slug, consent: CHECKOUT_CONSENTS.workbook.version });
  };
  const join = (plan: "monthly" | "yearly") => {
    if (consented("membership")) {
      void go("/api/checkout/membership", { plan, ...(slug ? { workbook: slug } : {}), consent: CHECKOUT_CONSENTS.membership.version });
    }
  };

  const offer = state.kind === "offer" ? state : null;
  const consentKinds: { kind: CheckoutConsentKind; heading: string }[] = [];
  if (signedIn && showBuy && offer?.buy.enabled) consentKinds.push({ kind: "workbook", heading: "If you buy this workbook" });
  if (signedIn && offer && (offer.membership.enabled || offer.yearly)) consentKinds.push({ kind: "membership", heading: "If you join the membership" });

  return (
    <div className="public-buy" id="buy">
      <div className="wb-actions">
        {start ? (
          <Link className="btn" href={start.href}>
            {start.label}
          </Link>
        ) : outlineOnlyLabel ? (
          <span className="btn secondary is-disabled" aria-disabled="true">
            {outlineOnlyLabel}
          </span>
        ) : null}
        {offer ? (
          <>
            {!showBuy ? null : !signedIn && offer.buy.enabled ? (
              <Link className="btn secondary public-buy-btn" href={signInHref}>
                <span>Buy, {offer.buy.note}</span>
                <span className="paywall-note">Sign in first</span>
              </Link>
            ) : (
              <button type="button" className="btn secondary public-buy-btn" disabled={!offer.buy.enabled || busy} onClick={offer.buy.enabled ? buy : undefined}>
                <span>{offer.buy.enabled ? `Buy, ${offer.buy.note}` : "Buy"}</span>
                <span className="paywall-note">{offer.buy.enabled ? "Yours to keep" : offer.buy.note}</span>
              </button>
            )}
            {!signedIn && offer.membership.enabled ? (
              <Link className="btn secondary public-buy-btn" href={signInHref}>
                <span>Join the membership, {offer.membership.note}</span>
                <span className="paywall-note">Sign in first</span>
              </Link>
            ) : (
              <button
                type="button"
                className="btn secondary public-buy-btn"
                disabled={!offer.membership.enabled || busy}
                onClick={offer.membership.enabled ? () => join("monthly") : undefined}
              >
                <span>{offer.membership.enabled ? `Join the membership, ${offer.membership.note}` : "Membership"}</span>
                <span className="paywall-note">{offer.membership.enabled ? "Every title in the membership" : offer.membership.note}</span>
              </button>
            )}
          </>
        ) : null}
      </div>

      {state.kind === "demo" ? <p className="muted small">{state.message}</p> : null}

      {offer?.yearly && signedIn ? (
        <p className="small">
          <button type="button" className="paywall-yearly" disabled={busy} onClick={() => join("yearly")}>
            {offer.yearly.label}
          </button>
        </p>
      ) : offer?.yearly ? (
        <p className="small muted">{offer.yearly.label}.</p>
      ) : null}

      {code && paidLines ? (
        <div className="public-buy-code" role="status">
          {paidLines.workbook && showBuy && offer?.buy.enabled ? <p>{paidLines.workbook}</p> : null}
          {paidLines.monthly && offer?.membership.enabled ? <p>{paidLines.monthly}</p> : null}
          {paidLines.yearly && offer?.yearly ? <p>{paidLines.yearly}</p> : null}
          <p className="small muted">The code is applied on the payment page. The total there is the total you pay.</p>
        </div>
      ) : null}

      {offer?.currencyNote ? <p className="small muted paywall-currency">{offer.currencyNote}</p> : null}

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
                  aria-describedby={missing === kind ? `public-consent-${kind}-error` : undefined}
                  aria-invalid={missing === kind ? true : undefined}
                />
                <span>
                  <strong>{heading}.</strong> {CHECKOUT_CONSENTS[kind].text}
                </span>
              </label>
              {missing === kind ? (
                <p id={`public-consent-${kind}-error`} className="small form-error paywall-consent-error" role="alert">
                  {CONSENT_REQUIRED_MESSAGE}
                </p>
              ) : null}
            </div>
          ))}
        </fieldset>
      ) : null}

      {offer && signedIn && ((showBuy && offer.buy.enabled) || offer.membership.enabled) ? (
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
      ) : null}

      {message ? (
        <p className="muted" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
