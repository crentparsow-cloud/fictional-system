import Link from "next/link";
import { HelpNowButton } from "@/components/HelpNowButton";
import { LOCKED_FOOTER_LINKS, TENANT_SAFETY_LINE, TENANT_WELLNESS_NOTICE } from "@/lib/tenant-standards";

/**
 * Shown when a tenant site cannot be read (the database is unreachable).
 * Rendered on the server, so the locked standards (F-068) are in the HTML
 * itself: Help now first, the safety line, the wellness notice and Akana's
 * legal links. House look, because the tenant's brand could not be read.
 */
export function TenantUnavailable() {
  return (
    <main id="main" className="wrap tenant-main tenant-unavailable">
      <h1>This site is not available right now</h1>
      <p>Please try again in a few minutes.</p>
      <p>
        <HelpNowButton />
      </p>
      <section className="tenant-locked" aria-label="Safety and privacy" data-locked="true">
        <p>{TENANT_SAFETY_LINE}</p>
        <p>{TENANT_WELLNESS_NOTICE}</p>
        <ul className="tenant-links" role="list">
          {LOCKED_FOOTER_LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href}>{l.label}</Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
