import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { preload } from "react-dom";
import "./fonts.css";
import "./globals.css";
import "./motion.css";
import "./themes/reading.css";
import "./themes/marks.css";
import "@theme-active";
import { brand } from "@/lib/brand";
import { DeviceVisit } from "@/components/DeviceVisit";
import { siteUrl } from "@/lib/site-url";
import { ACTIVE_DIRECTION_ID, activeDirection, preloadFonts } from "@/lib/design/active";

export const metadata: Metadata = {
  // Canonical and Open Graph URLs resolve against this (F-011). From
  // NEXT_PUBLIC_SITE_URL or AKANA_HOST; see .env.example.
  metadataBase: siteUrl(),
  title: {
    default: brand.name,
    template: `%s | ${brand.name}`,
  },
  description: brand.line,
  robots: { index: false, follow: false }, // off until launch
  // 10.1: the manifest is app/manifest.ts. These two make an iPhone's home screen copy open without Safari's bars.
  icons: { icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }], apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }] },
  appleWebApp: { capable: true, title: brand.name, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: activeDirection.light.canvas },
    { media: "(prefers-color-scheme: dark)", color: activeDirection.dark.canvas },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const tenant = h.get("x-akana-tenant") ?? "akana";
  const kind = h.get("x-akana-tenant-kind") ?? "marketplace";
  // Self-hosted faces of the active direction: React emits <link rel="preload">
  // in <head>, no inline script, so the CSP is unchanged. Latin only.
  for (const href of preloadFonts(activeDirection)) preload(href, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  return (
    <html lang="en-GB" data-tenant={tenant} data-tenant-kind={kind} data-direction={ACTIVE_DIRECTION_ID}>
      <body>
        {children}
        <DeviceVisit />
      </body>
    </html>
  );
}
