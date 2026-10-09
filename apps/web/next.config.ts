import type { NextConfig } from "next";

import { withSentryConfig } from "@sentry/nextjs/config";
import { buildCsp, ONE_TAP_PATHS, sentryOrigin } from "./csp.mjs";

/**
 * Security headers (F-125). No third-party scripts or pixels on any host, by
 * construction. Fonts load from the app itself. Supabase and Stripe are the
 * only outside origins the browser may talk to, and only for API calls and
 * Stripe's hosted checkout. Two exceptions switch on with their variables
 * (csp.mjs): Google One Tap on the sign-in pages only, and the Sentry ingest
 * origin in connect-src. scripts/check-csp.mjs guards both.
 */
const sentry = sentryOrigin(process.env.NEXT_PUBLIC_SENTRY_DSN);
const oneTapOn = Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);
const csp = buildCsp({ sentry });
const oneTapCsp = buildCsp({ oneTap: true, sentry });

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
      // Google One Tap (13.1): accounts.google.com only on the pages that render
      // it, and only while the client id is set. A later match for the same
      // header key replaces the earlier value.
      ...(oneTapOn ? ONE_TAP_PATHS.map((source) => ({ source, headers: [{ key: "Content-Security-Policy", value: oneTapCsp }] })) : []),
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

/**
 * Error tracking (10.3). With SENTRY_DSN blank the config is exported as is,
 * so nothing from Sentry is wired into the build. With it set, the Sentry
 * plugin instruments the server and client bundles. Source maps are uploaded
 * only when SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT are set too.
 */
export default process.env.SENTRY_DSN
  ? withSentryConfig(nextConfig, {
      silent: true,
      telemetry: false,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
      widenClientFileUpload: false,
    })
  : nextConfig;
