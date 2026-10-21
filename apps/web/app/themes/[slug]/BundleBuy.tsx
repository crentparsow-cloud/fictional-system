"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CHECKOUT_CONSENTS, CONSENT_REQUIRED_MESSAGE } from "@/lib/checkout-consent";
import { READER_TERMS_VERSION } from "@/lib/terms";

interface Props {
  theme: string;
  heading: string;
  bundle: string;
  singles: string;
  saving: string;
  signedIn: boolean;
}

/** Buy every title on a Theme together (5.8). Both prices are plain lines of the same size. */
export function BundleBuy({ theme, heading, bundle, singles, saving, signedIn }: Props) {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function start() {
    if (!signedIn) {
      router.push(`/sign-in?next=${encodeURIComponent(`/themes/${theme}`)}`);
      return;
    }
    if (!agreed) {
      setMissing(true);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/checkout/bundle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ theme, terms: READER_TERMS_VERSION, consent: CHECKOUT_CONSENTS.workbook.version }),
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (res.ok && body.url) {
        window.location.href = body.url;
        return;
      }
      setMessage(body.error ?? "Checkout could not start just now. Please try again later.");
    } catch {
      setMessage("Checkout could not start just now. Please try again later.");
    }
    setBusy(false);
  }

  return (
    <section className="card bundle-offer" aria-labelledby="bundle-title">
      <h2 id="bundle-title">{heading}</h2>
      <p className="info-price">{bundle}</p>
      <p className="info-price">{singles}</p>
      <p>{saving}</p>
      {signedIn ? (
        <label className="paywall-check">
          <input type="checkbox" checked={agreed} disabled={busy} onChange={(e) => (setAgreed(e.currentTarget.checked), e.currentTarget.checked && setMissing(false))} aria-invalid={missing || undefined} />
          <span>{CHECKOUT_CONSENTS.workbook.text}</span>
        </label>
      ) : null}
      {missing ? (
        <p className="small form-error" role="alert">
          {CONSENT_REQUIRED_MESSAGE}
        </p>
      ) : null}
      <button type="button" className="btn" disabled={busy} onClick={() => void start()}>
        {signedIn ? "Buy them together" : "Sign in to buy them together"}
      </button>
      {message ? (
        <p className="muted" role="alert">
          {message}
        </p>
      ) : null}
    </section>
  );
}
