import { NextResponse, type NextRequest } from "next/server";
import { reportOps } from "@/lib/ops-alerts";
import { handleResendWebhook } from "@/lib/resend-webhook";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Bounces and complaints from Resend (review finding M17).
 *
 *   POST /api/email/resend
 *   svix-id, svix-timestamp, svix-signature   (Resend sends these itself)
 *   -> 200 { received: true, replay }
 *
 * The signature is checked over the raw body with RESEND_WEBHOOK_SECRET
 * before anything is parsed (lib/resend-webhook.ts). Each event is stored
 * once by its svix-id. A hard bounce or a spam complaint adds a salted hash
 * of the address to the suppression list (migration 0076), every mailer
 * reads that list (lib/mail-suppression.ts), and the address comes off the
 * newsletter. No address is stored in plain form or logged.
 *
 * With RESEND_WEBHOOK_SECRET blank the route answers 503 and nothing is
 * suppressed. A database failure answers 500, so Resend tries again.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret || !secret.trim()) return NextResponse.json({ error: "not_configured" }, { status: 503, headers: NO_STORE });
  const rawBody = await request.text();

  let admin: ReturnType<typeof createAdminClient> | null = null;
  const outcome = await handleResendWebhook(
    rawBody,
    { id: request.headers.get("svix-id"), timestamp: request.headers.get("svix-timestamp"), signature: request.headers.get("svix-signature") },
    {
      secret,
      async record(eventId, type, reason, addresses) {
        admin = createAdminClient();
        const { data, error } = await admin.rpc("email_webhook_record", { p_event_id: eventId, p_type: type, p_reason: reason, p_addresses: addresses });
        if (error) {
          console.error("resend_webhook_record_failed", error.code ?? "unknown");
          throw new Error("sql_failed");
        }
        return String(data ?? "");
      },
    },
  );
  if (outcome.status === 500 && admin) await reportOps(admin, "webhook_failure", "api/email/resend", "record_failed");
  return NextResponse.json(outcome.body, { status: outcome.status, headers: NO_STORE });
}
