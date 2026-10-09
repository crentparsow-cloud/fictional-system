/**
 * Server instrumentation (10.3). Next runs register() once per runtime at
 * start-up. With SENTRY_DSN blank nothing is imported and nothing runs. With
 * it set, the matching Sentry config loads and onRequestError forwards
 * server render and route errors, scrubbed, to Sentry.
 */
type SentryModule = typeof import("@sentry/nextjs");
let sentry: SentryModule | null = null;

export async function register(): Promise<void> {
  if (!process.env.SENTRY_DSN) return;
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./sentry.server.config");
  if (process.env.NEXT_RUNTIME === "edge") await import("./sentry.edge.config");
  sentry = await import("@sentry/nextjs");
}

export const onRequestError: SentryModule["captureRequestError"] = (...args) => {
  if (sentry) sentry.captureRequestError(...args);
};
