// F-125: fail the build if anyone adds a script origin to the Content Security
// Policy beyond the allow list below. Stripe's hosted checkout is the only
// third-party script Akana loads everywhere, and only on checkout routes.
// Google One Tap (13.1) may add accounts.google.com, but only on the sign-in
// pages in ONE_TAP_PATHS, never on the public pages the e2e suite checks.
// Sentry (10.3) may add its ingest origin to connect-src, and only while the
// DSN is set.
import { buildCsp, GOOGLE_GSI, ONE_TAP_PATHS, originsIn, sentryOrigin } from "../apps/web/csp.mjs";

const ALLOWED = new Set(["'self'", "'unsafe-inline'", "https://js.stripe.com"]);
const PUBLIC_PAGES = ["/", "/help-now", "/publish"];
const failures = [];

function scriptSources(csp) {
  const match = /script-src ([^;]+)/.exec(csp);
  return match ? match[1].split(/\s+/).filter(Boolean) : [];
}

// 1. The base policy, DSN blank: no script origin beyond the allow list and
//    no Sentry origin anywhere.
const base = buildCsp({ sentry: sentryOrigin(process.env.NEXT_PUBLIC_SENTRY_DSN) });
const extra = scriptSources(base).filter((s) => !ALLOWED.has(s));
if (extra.length) failures.push(`new script origin in base CSP, not allowed: ${extra.join(" ")}`);
if (!process.env.NEXT_PUBLIC_SENTRY_DSN && /sentry/i.test(base)) failures.push("Sentry origin present while the DSN is blank");

// 2. The One Tap policy adds exactly Google's GSI origin to script-src.
const oneTap = buildCsp({ oneTap: true });
const oneTapExtra = scriptSources(oneTap).filter((s) => !ALLOWED.has(s));
if (oneTapExtra.join(" ") !== GOOGLE_GSI.script) failures.push(`One Tap CSP script-src should add only ${GOOGLE_GSI.script}, got: ${oneTapExtra.join(" ")}`);

// 3. One Tap never applies to the public pages the e2e third-party test loads.
for (const p of PUBLIC_PAGES) {
  if (ONE_TAP_PATHS.includes(p)) failures.push(`One Tap must not render on ${p}`);
}

// 4. With a DSN set, exactly that origin joins connect-src and nothing else changes.
const dsn = "https://abc123@o4500.ingest.de.sentry.io/99";
const withSentry = buildCsp({ sentry: sentryOrigin(dsn) });
const added = originsIn(withSentry, "connect-src").filter((o) => !originsIn(buildCsp(), "connect-src").includes(o));
if (added.join(" ") !== "https://o4500.ingest.de.sentry.io") failures.push(`Sentry DSN should add only its origin to connect-src, got: ${added.join(" ")}`);
if (scriptSources(withSentry).join(" ") !== scriptSources(buildCsp()).join(" ")) failures.push("Sentry must not change script-src");
if (sentryOrigin("") !== null || sentryOrigin("not a url") !== null) failures.push("sentryOrigin must be null for a blank or malformed DSN");

if (failures.length) {
  for (const f of failures) console.error(f);
  process.exit(1);
}
console.log("CSP script-src is clean");
