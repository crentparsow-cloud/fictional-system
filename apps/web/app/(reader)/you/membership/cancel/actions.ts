"use server";

import { redirect } from "next/navigation";
import { getReaderSession } from "@/lib/auth";
import { parseCancelForm, pickSubject } from "@/lib/cancel-flow";
import { runCancelEvent, type CancelOutcome } from "@/lib/membership-cancel";
import { loadSubjects, stripeSubscriptions } from "@/lib/membership-cancel-server";
import { amountFor, pricePointFromRow } from "@/lib/pricing";
import { MARKETS } from "@/lib/markets";
import { cancelMailFor } from "@/lib/selling-mail";
import { createUserClient } from "@/lib/supabase/server";
import { tenantIdForRequest } from "@/lib/tenant-id";

/**
 * The Cancel button, the pause buttons (14.24, 14.25). Runs as the signed-in
 * reader. The subscription acted on is read from the reader's own rows, never
 * from the form, so a posted id cannot reach anyone else's membership.
 * Comes back to /you with a plain notice.
 */

const NOTICE: Record<CancelOutcome | "failed", string> = {
  cancelled: "cancelled",
  cancelled_now: "cancelled_now",
  paused: "paused",
  stayed: "stayed",
  ineligible: "unchanged",
  failed: "cancel_failed",
};

export async function submitCancel(formData: FormData): Promise<void> {
  const session = await getReaderSession();
  if (!session) redirect("/sign-in?next=/you/membership/cancel");
  const tenantId = await tenantIdForRequest();
  const event = parseCancelForm((k) => formData.get(k));
  const back = (code: string): never => redirect(`/you?membership=${code}#membership`);
  if (!tenantId || !event) return back("cancel_failed");

  let outcome: CancelOutcome | "failed" = "failed";
  try {
    const supabase = await createUserClient();
    const subject = pickSubject(await loadSubjects(supabase, session.userId, tenantId));
    let priceMinor: number | null = null;
    if (subject?.plan) {
      const { data: row } = await supabase.from("price_points").select("id, kind, amounts, stripe_price_id, active").eq("id", subject.plan).maybeSingle();
      const point = row ? pricePointFromRow(row as { id: string; kind: string; amounts: unknown; stripe_price_id: string | null; active: boolean }) : null;
      priceMinor = point ? amountFor(point, MARKETS.GB) : null;
    }
    const mail = cancelMailFor({
      userId: session.userId,
      email: session.email ?? "",
      name: null,
      priceMinor,
      currency: "GBP",
    });
    outcome = await runCancelEvent(event, subject, new Date(), stripeSubscriptions(), session.email ? mail : { paused: async () => null, endedNow: async () => null });
  } catch (err) {
    console.error("membership_cancel_failed", { reason: err instanceof Error ? err.name : "unknown" });
  }
  return back(NOTICE[outcome]);
}
