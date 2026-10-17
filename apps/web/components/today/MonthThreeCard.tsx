"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import type { MonthThreeOffer } from "@/lib/today/cards";

const KEY = "akana.monthThreeOffer.dismissed";

/**
 * The month-three shared-plan card. Shown once: pressing "Not now" hides it
 * on this device. Storage may be blocked, in which case the card simply
 * shows as normal. Server rendering shows the card, so it works without
 * script.
 */
function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function dismissedOnDevice(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

export function MonthThreeCard({ offer, href }: { offer: MonthThreeOffer; href: string }) {
  const stored = useSyncExternalStore(subscribe, dismissedOnDevice, () => false);
  const [hiddenNow, setHidden] = useState(false);
  if (stored || hiddenNow) return null;
  const dismiss = () => {
    try {
      window.localStorage.setItem(KEY, new Date().toISOString().slice(0, 10));
    } catch {
      /* storage blocked: hides for this visit only */
    }
    setHidden(true);
  };
  return (
    <article className="card today-card month-three" aria-labelledby="today-offer">
      <p className="eyebrow">Membership for two</p>
      <h2 id="today-offer">{offer.headline}</h2>
      <p className="muted">{offer.body}</p>
      <p>{offer.price}</p>
      <div className="cancel-actions">
        <Link className="btn secondary" href={href}>
          {offer.cta}
        </Link>
        <button type="button" className="btn secondary" onClick={dismiss}>
          Not now
        </button>
      </div>
    </article>
  );
}
