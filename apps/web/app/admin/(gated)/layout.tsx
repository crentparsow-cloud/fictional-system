import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { signOut } from "@/app/(auth)/sign-out/action";
import { safeNextPath } from "@/lib/auth";
import { getStaffSession } from "@/lib/staff";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s | Akana admin" },
  robots: { index: false, follow: false },
};

/**
 * Admin shell (F-080). The proxy already returns 404 for /admin on any host
 * but the Akana apex. Here: signed out goes to sign-in, signed-in non-staff
 * get a 404, staff without a second factor go to /admin/mfa.
 *
 * /admin/mfa sits outside this route group so it is not gated by itself.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const current = safeNextPath(h.get("x-akana-path"), "/admin");
  await getStaffSession(current.startsWith("/admin") ? current : "/admin");

  return (
    <div className="admin-shell">
      <header className="admin-bar">
        <div className="wrap admin-bar-inner">
          <Link href="/admin" className="admin-brand">
            Akana admin
          </Link>
          <form action={signOut}>
            <button type="submit" className="btn secondary admin-signout">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main id="main" className="wrap admin-main">
        {children}
      </main>
    </div>
  );
}
