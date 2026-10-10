import Link from "next/link";
import { money } from "@/lib/dashboards";
import { connectHold } from "@/lib/money/studio-payments";
import type { StudioContext } from "@/lib/studio-server";
import { createUserClient } from "@/lib/supabase/server";

/**
 * The Connect hold (build list 14.29). A title may be live while Stripe
 * Connect onboarding is unfinished; the money accrues and the payout run
 * skips the organisation. This banner names the one step left and what is
 * waiting. It reads the organisation's own balances through the user's
 * client, so RLS decides, and shows nothing when verified or nothing is owed.
 */
export async function ConnectHoldBanner({ ctx }: { ctx: StudioContext }) {
  if (ctx.org.isDemo || ctx.org.connectStatus === "verified") return null;
  const supabase = await createUserClient();
  const { data, error } = await supabase.from("royalty_balances").select("currency, balance_minor").eq("org_id", ctx.org.id);
  if (error) {
    console.error("studio_hold_balances_failed", error.code ?? "");
    return null;
  }
  const notice = connectHold({
    connectStatus: ctx.org.connectStatus,
    kind: ctx.org.kind,
    isDemo: ctx.org.isDemo,
    balances: (data ?? []) as { currency: string; balance_minor: number | string }[],
  });
  if (!notice) return null;
  const waiting = notice.waiting.map((w) => money(w.balance_minor, w.currency)).join(", ");
  return (
    <p className="studio-draft" role="note">
      <strong>Your earnings are waiting.</strong> {waiting} is recorded for {ctx.org.displayName} and held until payouts are set up. One step left: {notice.step}{" "}
      <Link href={notice.href}>Go to payouts</Link>.
    </p>
  );
}
