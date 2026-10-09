import Link from "next/link";
import { SignOutButton } from "@/components/SignOutButton";

/**
 * Shell for the Studio and the console (F-033, F-055). Served on the Akana apex only (proxy). Each
 * page checks sign-in and membership itself through requireStudio, so the
 * invitation page under /studio/join stays open to someone not yet signed in.
 */
export function StudioShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-shell studio-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="admin-bar">
        <div className="wrap admin-bar-inner">
          <Link href="/studio" className="admin-brand">
            Akana Studio
          </Link>
          <nav aria-label="Studio" className="studio-nav">
            <Link href="/studio/profile">Profile</Link>
            <Link href="/studio/books">Books</Link>
            <Link href="/studio/workbooks">Workbooks</Link>
            <Link href="/studio/dashboard">Readers</Link>
            <Link href="/studio/earnings">Earnings</Link>
            <Link href="/studio/payments">Payments</Link>
            <Link href="/console">Team</Link>
            <Link href="/console/rollup">Roll-up</Link>
            <Link href="/payouts">Payouts</Link>
            <Link href="/studio/help">Help</Link>
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
