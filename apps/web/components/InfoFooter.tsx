import Link from "next/link";
import { brand } from "@/lib/brand";

/**
 * Footer for the help, trust, legal and plans pages (F-009, F-010, F-121).
 * Links are 44px tap targets through .info-footer-links.
 */
export const INFO_FOOTER_LINKS = [
  { href: "/help", label: "Help centre" },
  { href: "/help-now", label: "Help now" },
  { href: "/trust", label: "Trust" },
  { href: "/pricing", label: "Pricing" },
  { href: "/legal/terms", label: "Reader terms" },
  { href: "/legal/privacy", label: "Privacy notice" },
  { href: "/legal/cookies", label: "Cookie statement" },
  { href: "/legal/refunds", label: "Refund policy" },
  { href: "/takedown", label: "Report content" },
] as const;

export function InfoFooter() {
  return (
    <footer className="footer info-footer">
      <ul className="info-footer-links" role="list">
        {INFO_FOOTER_LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href}>{l.label}</Link>
          </li>
        ))}
      </ul>
      <p>{brand.wellnessNotice}</p>
    </footer>
  );
}
