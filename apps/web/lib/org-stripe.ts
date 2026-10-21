import "server-only";
import type Stripe from "stripe";
import { isTestKey } from "@/lib/money/reconcile";
import { getStripe } from "@/lib/stripe";

/** The Stripe client, only in test mode. Organisation billing stays in test mode until Crent switches it on. */
export function testStripe(): Stripe | null {
  if (!isTestKey(process.env.STRIPE_SECRET_KEY)) return null;
  try {
    return getStripe();
  } catch {
    return null;
  }
}
