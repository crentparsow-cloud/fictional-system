import { PAYMENT_MARK, trustItems, type TrustKind } from "@/lib/trust-strip";

/**
 * The trust strip (5.10). Plain list, no script, no image from anywhere. The
 * padlock is drawn here and is decoration only. Sits inside the payment box,
 * under the consent, not above the page.
 */
export function TrustStrip({ kind }: { kind: TrustKind }) {
  const items = trustItems(kind);
  return (
    <div className="trust-strip" role="group" aria-label="Before you pay">
      <p className="trust-mark">
        <svg aria-hidden="true" focusable="false" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
        <span>{PAYMENT_MARK}</span>
      </p>
      <ul>
        {items.map((i) => (
          <li key={i.id}>{i.text}</li>
        ))}
      </ul>
    </div>
  );
}
