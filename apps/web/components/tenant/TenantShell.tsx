import Link from "next/link";
import { HelpNowButton } from "@/components/HelpNowButton";
import type { BrandLink } from "@/lib/tenant-brand";
import type { TenantSite } from "@/lib/tenant-site";
import {
  DEMO_SITE_NOTICE,
  LOCKED_FOOTER_LINKS,
  POWERED_BY,
  TENANT_PRIVACY_LINE,
  TENANT_SAFETY_LINE,
  TENANT_WELLNESS_NOTICE,
} from "@/lib/tenant-standards";

/**
 * The frame of every tenant page (F-067, F-068).
 *
 * Tenant branding arrives as CSS custom properties from /tenant.css, a
 * generated stylesheet (no inline styles, CSP-safe). The tenant sets its
 * name, logo, colours, heading font and extra footer links.
 *
 * Locked, whatever the tenant sets: Help now in the header on every page,
 * the demo notice on a demo tenant, and the footer block with the wellness
 * notice, the safety line, the privacy line and the links to Help now,
 * Akana's privacy notice, reader terms and cookie statement. Help now keeps
 * Akana's safety colours, which are not brand tokens.
 */
export function TenantShell({ site, children }: { site: TenantSite; children: React.ReactNode }) {
  const { brand } = site;
  const extra: BrandLink[] = [...(brand.footer_links ?? []), ...(brand.legal_links ?? [])];
  return (
    <div className="tenant-shell">
      {/* Generated per host from the tenant's validated brand, so it cannot be a static import. */}
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="/tenant.css" precedence="default" />
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {site.isDemo ? (
        <p className="tenant-demo-banner" role="note">
          <span className="badge demo">Demo</span> {DEMO_SITE_NOTICE}
        </p>
      ) : null}
      <header className="tenant-header">
        <div className="wrap tenant-header-inner">
          <Link href="/" className="tenant-brand">
            {brand.logo ? (
              // A tenant logo from /brand/ or Supabase storage; next/image adds nothing for an SVG here.
              // eslint-disable-next-line @next/next/no-img-element
              <img className="tenant-logo" src={brand.logo.src} alt={brand.logo.alt} height={40} />
            ) : null}
            <span className="tenant-name">{site.name}</span>
          </Link>
          <HelpNowButton />
        </div>
      </header>
      <main id="main" className="wrap tenant-main" tabIndex={-1}>
        {children}
      </main>
      <footer className="footer tenant-footer">
        <div className="wrap">
          <section className="tenant-locked" aria-label="Safety and privacy" data-locked="true">
            <p>{TENANT_WELLNESS_NOTICE}</p>
            <p>{TENANT_SAFETY_LINE}</p>
            <p>{TENANT_PRIVACY_LINE}</p>
            <ul className="tenant-links" role="list">
              {LOCKED_FOOTER_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href}>{l.label}</Link>
                </li>
              ))}
            </ul>
          </section>
          {extra.length ? (
            <ul className="tenant-links tenant-own-links" role="list" aria-label={`More from ${site.name}`}>
              {extra.map((l) => (
                <li key={`${l.label}|${l.href}`}>
                  <a href={l.href} rel="noopener noreferrer">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          {site.poweredBy ? <p className="tenant-powered muted small">{POWERED_BY}</p> : null}
        </div>
      </footer>
    </div>
  );
}
