"use client";

import { useState } from "react";
import { READER_TERMS_LINKS, READER_TERMS_VERSION } from "@/lib/terms";

interface Option {
  months: number;
  label: string;
  price: string;
}

/**
 * Buy a gift membership (5.6, 5.7). One payment, nothing renews. The message
 * is the buyer's own words and goes in the email to the recipient. The
 * prices are shown as plain figures, one per length.
 */
export function GiftForm({ options, messageMax }: { options: Option[]; messageMax: number }) {
  const [months, setMonths] = useState<number>(options[0]?.months ?? 1);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [senderName, setSenderName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch("/api/checkout/gift", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ months, recipientEmail, recipientName, senderName, message, terms: READER_TERMS_VERSION }),
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (res.ok && body.url) {
        window.location.assign(body.url);
        return;
      }
      setProblem(body.error ?? "Checkout could not start just now. Please try again later.");
    } catch {
      setProblem("Checkout could not start just now. Please try again later.");
    }
    setBusy(false);
  }

  return (
    <form className="card" onSubmit={(e) => void start(e)}>
      <fieldset className="plan-toggle">
        <legend>How long should it last?</legend>
        <div className="plan-toggle-options">
          {options.map((o) => (
            <label key={o.months} className="plan-option" data-selected={months === o.months ? "true" : "false"}>
              <input type="radio" name="gift-months" value={o.months} checked={months === o.months} onChange={() => setMonths(o.months)} />
              <span className="plan-option-name">{o.label}</span>
              <span className="plan-price">
                <span className="plan-price-figure">{o.price}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <label htmlFor="gift-to-email">Their email address</label>
      <input id="gift-to-email" type="email" required autoComplete="off" inputMode="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.currentTarget.value)} />
      <label htmlFor="gift-to-name">Their first name (optional)</label>
      <input id="gift-to-name" type="text" maxLength={60} autoComplete="off" value={recipientName} onChange={(e) => setRecipientName(e.currentTarget.value)} />
      <label htmlFor="gift-from-name">Your name (optional)</label>
      <input id="gift-from-name" type="text" maxLength={60} autoComplete="given-name" value={senderName} onChange={(e) => setSenderName(e.currentTarget.value)} />
      <label htmlFor="gift-message">A message (optional)</label>
      <textarea id="gift-message" rows={4} maxLength={messageMax} value={message} onChange={(e) => setMessage(e.currentTarget.value)} />
      <p className="small muted">Up to {messageMax} characters. We put it in the email as you write it. We do not name any workbook.</p>
      <p className="small muted">
        You pay once. Nothing renews. By continuing to payment you agree to our{" "}
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
      <button type="submit" className="btn" disabled={busy}>
        Continue to payment
      </button>
      {problem ? (
        <p className="muted" role="alert">
          {problem}
        </p>
      ) : null}
    </form>
  );
}
