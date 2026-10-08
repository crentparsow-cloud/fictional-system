import "server-only";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { reportOpsServer } from "@/lib/ops-report";
import { connectRepo } from "@/lib/payouts/connect";
import { handleConnectEvent, isConnectEvent } from "@/lib/payouts/connect-webhook";
import { PAYOUT_CHANGE_COPY, sendPayoutChangeEmails } from "@/lib/payouts/payout-mail";
import { createAdminClient } from "@/lib/supabase/admin";

export { isConnectEvent };

/**
 * The Connect branch of POST /api/stripe/webhook (F-099, F-143). The route
 * has already checked the signature. Always 200 once handled, so Stripe does
 * not retry; a database error is a 500 so it does, and opens a
 * webhook_failure ops alert. The payout change email is best effort and
 * never turns into a retry. Logs carry ids only.
 */
export async function handleConnectWebhook(event: Stripe.Event, origin: string): Promise<NextResponse> {
  try {
    const admin = createAdminClient();
    const outcome = await handleConnectEvent(event, connectRepo(admin));
    const { notify, ...logged } = outcome;
    console.info("stripe connect webhook", logged);
    if (notify) {
      await sendPayoutChangeEmails(admin, {
        orgId: notify.orgId,
        what: PAYOUT_CHANGE_COPY[`bank_${notify.change}`],
        dedupeKey: notify.dedupeKey,
        origin,
      });
    }
    return NextResponse.json({ received: true, action: outcome.action });
  } catch (err) {
    console.error("stripe connect webhook: handler failed", { event: event.id, type: event.type, reason: err instanceof Error ? err.message : "unknown" });
    // F-142: one alert email when this opens an alert. Never throws.
    await reportOpsServer("webhook_failure", "api/stripe/webhook/connect", "handler_failed");
    return NextResponse.json({ error: "handler_failed" }, { status: 500 });
  }
}
