import Link from "next/link";
import { SignOutButton } from "@/components/SignOutButton";
import { orgNotice } from "@/lib/org-pilot";

/**
 * Shell for Akana for organisations: the console at /org and the two
 * invitation pages. Served on the Akana apex only (proxy). Each page checks
 * sign-in itself, so an invitation page stays open to someone not yet
 * signed in.
 */
export function OrgShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-shell studio-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="admin-bar">
        <div className="wrap admin-bar-inner">
          <Link href="/org" className="admin-brand">
            Akana for organisations
          </Link>
          <nav aria-label="Organisation" className="studio-nav">
            <Link href="/org">Seats</Link>
            <Link href="/org/invite">Invite in bulk</Link>
            <Link href="/org/groups">Groups</Link>
            <Link href="/org/reports">Reports</Link>
            <Link href="/org/billing">Billing</Link>
            <Link href="/trust">How answers are protected</Link>
            <Link href="/help">Help</Link>
          </nav>
          <SignOutButton label="Sign out" className="btn secondary admin-signout" />
        </div>
      </header>
      <main id="main" className="wrap admin-main" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}

export function OrgNoticeLine({ code }: { code: string | string[] | undefined }) {
  const m = orgNotice(code);
  if (!m) return null;
  return (
    <p className={`admin-notice admin-notice-${m.tone}`} role={m.tone === "error" ? "alert" : "status"}>
      {m.text}
    </p>
  );
}
