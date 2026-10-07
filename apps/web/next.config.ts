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
  "form-action 'self' https://checkout.stripe.com",
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
    ];
  },
};

export default nextConfig;
