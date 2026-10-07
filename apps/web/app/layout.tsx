import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { brand } from "@/lib/brand";
import { siteUrl } from "@/lib/site-url";

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
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1f4e5a" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1719" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const tenant = h.get("x-akana-tenant") ?? "akana";
  const kind = h.get("x-akana-tenant-kind") ?? "marketplace";
  return (
    <html lang="en-GB" data-tenant={tenant} data-tenant-kind={kind}>
      <body>{children}</body>
    </html>
  );
}
