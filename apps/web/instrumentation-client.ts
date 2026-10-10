import { scrubBreadcrumb, scrubEvent } from "@/lib/sentry-scrub";

/**
 * Error tracking in the browser (10.3). With NEXT_PUBLIC_SENTRY_DSN blank
 * this file does nothing: the SDK is behind a dynamic import that never
 * runs, so no Sentry code is fetched and no script tag is added. With it
 * set, the bundled SDK (no third-party script) reports errors to the DSN's
 * origin, which csp.mjs adds to connect-src.
 *
 * Replays, when sampled, mask every piece of text and block every image and
 * video (replayIntegration below). They are off unless
 * NEXT_PUBLIC_SENTRY_REPLAY_ON_ERROR is set, and never record a whole session.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

type SentryModule = typeof import("@sentry/nextjs");
let sentry: SentryModule | null = null;

if (dsn) {
  import("@sentry/nextjs")
    .then((Sentry) => {
      const replayOnError = Number(process.env.NEXT_PUBLIC_SENTRY_REPLAY_ON_ERROR ?? "0");
      Sentry.init({
        dsn,
        environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
        sendDefaultPii: false,
        tracesSampleRate: 0,
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: Number.isFinite(replayOnError) && replayOnError > 0 ? Math.min(replayOnError, 1) : 0,
        integrations: [
          Sentry.replayIntegration({
            maskAllText: true,
            maskAllInputs: true,
            blockAllMedia: true,
            networkDetailAllowUrls: [],
            networkCaptureBodies: false,
          }),
        ],
        beforeSend: scrubEvent,
        beforeBreadcrumb: scrubBreadcrumb,
      });
      sentry = Sentry;
    })
    .catch(() => {
      // Blocked by the browser or offline: the app runs the same without it.
    });
}

/** Next calls this on every client navigation; forwarded once the SDK is up. */
export function onRouterTransitionStart(href: string, navigationType: string): void {
  sentry?.captureRouterTransitionStart(href, navigationType);
}
