"use client";

import { useState } from "react";
import { CHECKOUT_CONSENTS, CONSENT_REQUIRED_MESSAGE } from "@/lib/checkout-consent";
import { READER_TERMS_LINKS, READER_TERMS_VERSION } from "@/lib/terms";

interface Plan {
  plan: "monthly" | "yearly";
  label: string;
  full: string;
  student: string;
}

/**
 * Join at the student price (14.22). The reader's academic email is already
 * confirmed; the server checks that again at checkout and pins the coupon.
 * Both prices are shown side by side, in the same size, with no strike-through.
 * The consent box carries the same wording as the ordinary membership checkout.
 */
export function StudentJoin({ plans, percent }: { plans: Plan[]; percent: number }) {
  const [plan, setPlan] = useState<Plan["plan"]>(plans[0]?.plan ?? "monthly");
  const [agreed, setAgreed] = useState(false);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function start() {
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
        body: JSON.stringify({ plan, student: true, terms: READER_TERMS_VERSION, consent: CHECKOUT_CONSENTS.membership.version }),
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
    <div className="card student-join">
      <h2>Join at the student price</h2>
      <p>{percent} percent off the membership, for as long as your academic email stays confirmed.</p>
      <fieldset className="plan-toggle">
        <legend>Choose a plan</legend>
        <div className="plan-toggle-options">
          {plans.map((p) => (
            <label key={p.plan} className="plan-option" data-selected={plan === p.plan ? "true" : "false"}>
              <input type="radio" name="student-plan" value={p.plan} checked={plan === p.plan} onChange={() => setPlan(p.plan)} />
              <span className="plan-option-name">{p.label}</span>
              <span className="plan-price">
                <span className="plan-price-figure">Student price {p.student}</span>
                <span className="plan-price-figure">Standard price {p.full}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="paywall-check">
        <input type="checkbox" checked={agreed} disabled={busy} onChange={(e) => (setAgreed(e.currentTarget.checked), e.currentTarget.checked && setMissing(false))} aria-invalid={missing || undefined} />
        <span>{CHECKOUT_CONSENTS.membership.text}</span>
      </label>
      {missing ? (
        <p className="small form-error" role="alert">
          {CONSENT_REQUIRED_MESSAGE}
        </p>
      ) : null}
      <p className="small muted">
        It renews automatically at the student price until you cancel. Go to You, then Cancel membership. By continuing to payment you agree to our{" "}
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
      <button type="button" className="btn" disabled={busy} onClick={() => void start()}>
        Continue to payment
      </button>
      {message ? (
        <p className="muted" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
