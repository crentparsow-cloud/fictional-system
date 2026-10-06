import Link from "next/link";

/**
 * Help now, one tap away (F-021). A link styled as the help button, so it
 * works without JavaScript and with the keyboard. Pass the reader's market
 * when it is known so the hub opens on their lines straight away.
 */
export function HelpNowButton({ market, label = "Help now", className = "" }: { market?: string | null; label?: string; className?: string }) {
  const href = market ? `/help-now?m=${encodeURIComponent(market)}` : "/help-now";
  return (
    <Link href={href} className={`btn help help-now-btn ${className}`.trim()}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="3.5" />
        <path d="M5.6 5.6l3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9" />
      </svg>
      <span>{label}</span>
    </Link>
  );
}
