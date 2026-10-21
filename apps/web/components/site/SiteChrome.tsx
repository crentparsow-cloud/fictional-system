"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Puts the public header and footer around marketplace pages. Reader, admin,
 * organisation, studio and console screens have their own shells, and the
 * sign-in pages stay bare. The header and footer are server components passed
 * in as props, so only this small gate runs in the browser.
 */
const BARE_PREFIXES = [
  "/home", "/my-workbooks", "/read", "/today", "/you", "/groups", "/toolkit", "/student", "/consent",
  "/org", "/studio", "/console", "/admin", "/sign-in", "/sign-out", "/welcome", "/terms", "/auth", "/api", "/ex",
] as const;

export function hasSiteChrome(pathname: string | null): boolean {
  if (!pathname) return true;
  return !BARE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function SiteChrome({ header, footer, enabled, children }: { header: ReactNode; footer: ReactNode; enabled: boolean; children: ReactNode }) {
  const pathname = usePathname();
  if (!enabled || !hasSiteChrome(pathname)) return <>{children}</>;
  return (
    <div className="site-chrome" data-site-chrome="">
      {header}
      {children}
      {footer}
    </div>
  );
}
