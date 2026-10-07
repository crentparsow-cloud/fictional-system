"use client";

import { useState } from "react";
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
 */
export function PaywallCard({ state, slug, fullLength, unitWord }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function buy() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workbook: slug }),
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
          <div className="paywall-actions">
            <button type="button" className="btn" disabled={!state.buy.enabled || busy} onClick={state.buy.enabled ? buy : undefined}>
              <span>{state.buy.label}</span>
              <span className="paywall-note">{state.buy.note}</span>
            </button>
            <button type="button" className="btn secondary" disabled={!state.membership.enabled}>
              <span>{state.membership.label}</span>
              <span className="paywall-note">{state.membership.note}</span>
            </button>
          </div>
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
