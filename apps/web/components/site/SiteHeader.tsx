import Link from "next/link";
import { HeaderActions } from "@/components/site/HeaderActions";
import { brand } from "@/lib/brand";

export const SITE_NAV = [
  { href: "/library", label: "Library" },
  { href: "/themes", label: "Shelves" },
  { href: "/pricing", label: "Pricing" },
  { href: "/help", label: "Help" },
] as const;

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header-bar wrap">
        <Link href="/" className="site-logo" aria-label={`${brand.name} home`}>{brand.name}</Link>
        <nav aria-label="Main" className="site-nav">
          <ul role="list">
            {SITE_NAV.map((l) => (
              <li key={l.href}><Link href={l.href}>{l.label}</Link></li>
            ))}
          </ul>
        </nav>
        <HeaderActions />
      </div>
    </header>
  );
}
