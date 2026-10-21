import * as Sentry from "@sentry/nextjs";
import { scrubBreadcrumb, scrubEvent } from "@/lib/sentry-scrub";

/** Node runtime (10.3). Imported by instrumentation.ts only when SENTRY_DSN is set. */
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? "development",
  sendDefaultPii: false,
  tracesSampleRate: 0,
  // Request bodies, cookies, IPs and query strings are never collected, and the event is scrubbed as well.
  integrations: [Sentry.requestDataIntegration({ include: { data: false, cookies: false, ip: false, query_string: false, headers: true, url: true } })],
  beforeSend: scrubEvent,
  beforeBreadcrumb: scrubBreadcrumb,
});
