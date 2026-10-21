import * as Sentry from "@sentry/nextjs";
import { scrubBreadcrumb, scrubEvent } from "@/lib/sentry-scrub";

/** Edge runtime, the proxy (10.3). Imported by instrumentation.ts only when SENTRY_DSN is set. */
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? "development",
  sendDefaultPii: false,
  tracesSampleRate: 0,
  beforeSend: scrubEvent,
  beforeBreadcrumb: scrubBreadcrumb,
});
