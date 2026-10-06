import "server-only";
import Stripe from "stripe";

/**
 * The Stripe server client. Server only: this module must never reach a
 * client bundle, and the build check greps .next/static for "stripe" so a
 * slip fails loudly.
 *
 * apiVersion is pinned to the version the installed stripe package's types
 * were generated for, so the typed request and event shapes match what the
 * API returns. Bump the package and this constant together.
 */
export const STRIPE_API_VERSION = "2026-09-30.endive" as const satisfies Stripe.LatestApiVersion;

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set. Add the test-mode secret key to apps/web/.env.local (see .env.example).");
  }
  cached = new Stripe(key, { apiVersion: STRIPE_API_VERSION, typescript: true, appInfo: { name: "Akana", version: "0.1.0" } });
  return cached;
}

/** The webhook signing secret for the platform endpoint, or a clear error. */
export function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not set. Copy the signing secret from the Stripe webhook endpoint (or stripe listen) into apps/web/.env.local.");
  }
  return secret;
}
