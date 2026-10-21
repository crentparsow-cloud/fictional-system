import Link from "next/link";
import { brand } from "@/lib/brand";
import { company, support } from "@/lib/company";

const COLUMNS = [
  { title: "Read", links: [["Library", "/library"], ["Shelves", "/themes"], ["Pricing", "/pricing"], ["Gift a workbook", "/gift"], ["Book clubs", "/book-clubs"]] },
  { title: "Help", links: [["Help centre", "/help"], ["Reading your way", "/accessibility"], ["How we look after you", "/trust"], ["Contact us", "/contact"]] },
  { title: "Partners", links: [["Publish with Akana", "/publish"], ["Organisations", "/organisations"], ["Authors", "/authors"], ["Publishers", "/publishers"]] },
  { title: "Legal", links: [["Reader terms", "/legal/terms"], ["Privacy notice", "/legal/privacy"], ["Cookie statement", "/legal/cookies"], ["Refund policy", "/legal/refunds"], ["Report content", "/takedown"]] },
] as const;

export function SiteFooter() {
  const s = support();
  return (
    <footer className="site-footer">
      <div className="wrap site-footer-grid">
        <div className="site-footer-brand">
          <p className="site-logo">{brand.name}</p>
          <p>{brand.line}</p>
          <p className="site-footer-help">Feeling low or in a hard place? <Link href="/help-now">Help now</Link></p>
        </div>
        {COLUMNS.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <h2>{c.title}</h2>
            <ul role="list">
              {c.links.map(([label, href]) => (
                <li key={href}><Link href={href}>{label}</Link></li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="wrap site-footer-base">
        <p>{brand.wellnessNotice}</p>
        <p>
          {company.legalName}, {company.address.join(", ")}. Company number {company.registrationNumber}.{" "}
          {s.email ? <>Write to us at <a href={`mailto:${s.email}`}>{s.email}</a>.</> : <>Write to us at {s.label}.</>}
        </p>
      </div>
    </footer>
  );
}
