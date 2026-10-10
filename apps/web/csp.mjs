// Content Security Policy builder (F-125), shared by next.config.ts and
// scripts/check-csp.mjs. Plain ESM so both can import it without a build.
//
// The base policy allows no third-party script. Stripe's hosted checkout is
// the one exception and is loaded only on checkout routes. Two optional
// origins are added from the environment, and only while it is set:
//
//   NEXT_PUBLIC_GOOGLE_CLIENT_ID  Google One Tap (13.1) on the sign-in pages
//                                 listed in ONE_TAP_PATHS, and nowhere else.
//   NEXT_PUBLIC_SENTRY_DSN        the Sentry ingest origin in connect-src
//                                 (10.3). No script tag: the SDK is bundled.

/**
 * Paths that render Google One Tap and so carry the wider policy. These are
 * Next.js header sources, so "/try/:slug" covers the signed-out first unit
 * (5.2), where the soft sign-in wall renders the Google sign-in component.
 */
export const ONE_TAP_PATHS = ["/sign-in", "/try/:slug"];

/** Google Identity Services origins, as Google's CSP guide lists them. */
export const GOOGLE_GSI = {
  script: "https://accounts.google.com/gsi/client",
  connect: "https://accounts.google.com/gsi/",
  frame: "https://accounts.google.com/gsi/",
  style: "https://accounts.google.com/gsi/style",
};

/**
 * The origin a Sentry DSN reports to, or null when the DSN is blank or
 * malformed. https://key@o123.ingest.de.sentry.io/456 gives
 * https://o123.ingest.de.sentry.io.
 * @param {string | undefined | null} dsn
 * @returns {string | null}
 */
export function sentryOrigin(dsn) {
  if (!dsn) return null;
  try {
    const u = new URL(dsn);
    if (u.protocol !== "https:" || !u.hostname) return null;
    return `https://${u.host}`;
  } catch {
    return null;
  }
}

/**
 * Build the policy. `oneTap` widens it for Google One Tap; `sentry` is the
 * ingest origin from sentryOrigin(), or null.
 * @param {{ oneTap?: boolean, sentry?: string | null }} [options]
 * @returns {string}
 */
export function buildCsp({ oneTap = false, sentry = null } = {}) {
  const script = ["'self'", "'unsafe-inline'", "https://js.stripe.com"];
  const style = ["'self'", "'unsafe-inline'"];
  const connect = ["'self'", "https://*.supabase.co", "wss://*.supabase.co", "https://api.stripe.com"];
  const frame = ["https://js.stripe.com", "https://checkout.stripe.com"];
  if (oneTap) {
    script.push(GOOGLE_GSI.script);
    style.push(GOOGLE_GSI.style);
    connect.push(GOOGLE_GSI.connect);
    frame.push(GOOGLE_GSI.frame);
  }
  if (sentry) connect.push(sentry);
  return [
    "default-src 'self'",
    `script-src ${script.join(" ")}`,
    `style-src ${style.join(" ")}`,
    "img-src 'self' data: blob: https://*.supabase.co",
    "font-src 'self'",
    `connect-src ${connect.join(" ")}`,
    `frame-src ${frame.join(" ")}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    // connect.stripe.com: Connect Express onboarding and dashboard links (F-099).
    "form-action 'self' https://checkout.stripe.com https://connect.stripe.com",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

/**
 * Every origin-like source of one directive, keywords and schemes removed.
 * @param {string} csp
 * @param {string} directive
 * @returns {string[]}
 */
export function originsIn(csp, directive) {
  const part = csp
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.split(/\s+/)[0] === directive);
  if (!part) return [];
  return part
    .split(/\s+/)
    .slice(1)
    .filter((s) => !s.startsWith("'") && !/^[a-z][a-z0-9+.-]*:$/i.test(s));
}
