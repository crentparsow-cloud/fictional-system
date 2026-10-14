"use client";

import Link from "next/link";
import { useState } from "react";
import { CANCEL_COPY, CANCEL_REASONS, chooseOffer, parseCancelReason, type CancelReason, type CancelView } from "@/lib/cancel-flow";
import type { SharedOffer } from "@/lib/shared-membership";
import { submitCancel } from "./actions";

export interface PauseLine {
  months: 1 | 2 | 3;
  button: string;
  line: string;
}

interface Props {
  view: Extract<CancelView, { kind: "cancellable" }>;
  sharedOffer: SharedOffer | null;
  /** The shared plan's price line, from the database. */
  sharedPrice: string | null;
  pauseLines: PauseLine[];
  /** What happens to access when Cancel is pressed, worked out on the server. */
  consequence: string;
}

/**
 * The one screen (14.24). An optional reason, one offer, then the Cancel
 * button. Choosing "cost" as the reason swaps a pause for the shared plan,
 * when the shared plan can be bought. Without script the pause shows and the
 * form still works. The Cancel button works with no reason chosen.
 */
export function CancelForm({ view, sharedOffer, sharedPrice, pauseLines, consequence }: Props) {
  const [reason, setReason] = useState<CancelReason | null>(null);
  const offer = chooseOffer({ reason, view, sharedOffer });

  return (
    <form action={submitCancel} className="cancel-form">
      <fieldset className="cancel-reasons">
        <legend>{CANCEL_COPY.reasonLegend}</legend>
        {CANCEL_REASONS.map((r) => (
          <label key={r.value} className="cancel-reason">
            <input type="radio" name="reason" value={r.value} checked={reason === r.value} onChange={(e) => setReason(parseCancelReason(e.currentTarget.value))} />
            <span>{r.label}</span>
          </label>
        ))}
        {reason ? (
          <button type="button" className="linklike small" onClick={() => setReason(null)}>
            Clear my choice
          </button>
        ) : null}
      </fieldset>

      {offer.kind === "pause" ? (
        <section className="card cancel-offer" aria-labelledby="cancel-offer-title">
          <h2 id="cancel-offer-title">Pause instead</h2>
          <p>Pause for one to three months. Nothing is charged while it is paused, and you can read everything you wrote.</p>
          <ul className="cancel-pauses">
            {pauseLines.map((p) => (
              <li key={p.months}>
                <button type="submit" name="intent" value={`pause-${p.months}`} className="btn secondary">
                  {p.button}
                </button>
                <span className="small muted"> {p.line}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {offer.kind === "shared" ? (
        <section className="card cancel-offer" aria-labelledby="cancel-offer-title">
          <h2 id="cancel-offer-title">{offer.offer.headline}</h2>
          <p>{offer.offer.body}</p>
          {sharedPrice ? <p className="info-price">{sharedPrice}</p> : null}
          <Link className="btn secondary" href={offer.offer.href}>
            {offer.offer.cta}
          </Link>
        </section>
      ) : null}

      <p>{consequence}</p>
      <div className="cancel-actions">
        <button type="submit" name="intent" value="cancel" className="btn">
          {CANCEL_COPY.cancelButton}
        </button>
        <Link className="btn secondary" href="/you#membership">
          {CANCEL_COPY.stayButton}
        </Link>
      </div>
      <p className="small muted">{CANCEL_COPY.afterCancel} We email you to confirm as soon as you press Cancel.</p>
    </form>
  );
}
