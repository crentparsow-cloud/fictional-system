import type { NextConfig } from "next";

/**
 * Security headers (F-125). No third-party scripts or pixels on any host, by
 * construction. Fonts load from the app itself. Supabase and Stripe are the
 * only outside origins the browser may talk to, and only for API calls and
 * Stripe's hosted checkout.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://js.stripe.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self'",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com",
  "frame-src https://js.stripe.com https://checkout.stripe.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  // connect.stripe.com: Connect Express onboarding and dashboard links (F-099).
  "form-action 'self' https://checkout.stripe.com https://connect.stripe.com",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self \"https://checkout.stripe.com\"), interest-cohort=()" },
  { key: "X-Frame-Options", value: "DENY" },
];

const partnerLinkHeaders = [
  { key: "Cache-Control", value: "no-store, max-age=0" },
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
  { key: "Referrer-Policy", value: "no-referrer" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@akana/schema", "@akana/validate", "@akana/seal", "@akana/engine", "@akana/emails"],
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      // Check-in partner token links (F-030): never cached, never indexed,
      // and the token in the path never leaves in a Referer header.
      { source: "/respond/:path*", headers: partnerLinkHeaders },
      { source: "/api/partner/:path*", headers: partnerLinkHeaders },
      // Studio invitation links (F-033): the token in the path never leaves in a Referer.
      { source: "/studio/join/:path*", headers: partnerLinkHeaders },
      // Organisation seat and owner invitation links (F-203): the same rules.
      { source: "/org/join/:path*", headers: partnerLinkHeaders },
      { source: "/org/admin-join/:path*", headers: partnerLinkHeaders },
      // Organisation join links (F-225, 0030): the same rules.
      { source: "/org/link/:path*", headers: partnerLinkHeaders },
      // Private file links (F-135): the same rules, so a storage path never leaks.
      { source: "/files/:path*", headers: partnerLinkHeaders },
      // Allowlist service worker (F-140): always revalidated, so a fix ships at once.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, max-age=0" }] },
      // Self-hosted fonts: names are not hashed, so a week's cache, not immutable.
      { source: "/fonts/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }] },
    ];
  },
};

export default nextConfig;
