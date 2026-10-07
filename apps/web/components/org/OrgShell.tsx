import Link from "next/link";
import { signOut } from "@/app/(auth)/sign-out/action";
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
            <Link href="/trust">How answers are protected</Link>
            <Link href="/help">Help</Link>
          </nav>
          <form action={signOut}>
            <button type="submit" className="btn secondary admin-signout">
              Sign out
            </button>
          </form>
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
