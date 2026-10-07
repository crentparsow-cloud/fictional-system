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

  // One path for both checkouts: the single workbook and the membership (F-097).
  async function start(url: string, payload: Record<string, string>) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
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

  const buy = () => start("/api/checkout", { workbook: slug });
  const join = (plan: "monthly" | "yearly") => start("/api/checkout/membership", { plan, workbook: slug });

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
          {state.yearly ? (
            <p className="small">
              <button type="button" className="paywall-yearly" disabled={busy} onClick={() => join("yearly")}>
                {state.yearly.label}
              </button>
            </p>
          ) : null}
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
