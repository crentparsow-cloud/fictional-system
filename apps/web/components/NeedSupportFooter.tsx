import Link from "next/link";

/**
 * The quiet footer link non-wellbeing pages carry (F-021). One line, no
 * button, so a finance or career reader is not met with crisis copy but can
 * still reach the hub in one tap.
 */
export function NeedSupportFooter({ label = "Need support?", market }: { label?: string; market?: string | null }) {
  const href = market ? `/help-now?m=${encodeURIComponent(market)}` : "/help-now";
  return (
    <footer className="need-support">
      <Link href={href}>{label}</Link>
    </footer>
  );
}
