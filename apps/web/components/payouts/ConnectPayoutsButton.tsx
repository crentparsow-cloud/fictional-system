import { connectPayouts } from "@/app/payouts/actions";
import type { PayoutStatus } from "@/lib/payouts/status";

/**
 * "Connect payouts" (F-099). A plain form posting to a server action, so it
 * works without script and Next checks the origin. Drop it into any page
 * for an organisation's owner or finance contact:
 *
 *   <ConnectPayoutsButton orgId={org.id} status={org.connect_status} back="/author/onboarding" />
 *
 * The action asks for an authenticator code first when the last one is more
 * than ten minutes old (F-143), then sends the person to Stripe. Stripe
 * brings them back to /payouts/return, which shows the result on /payouts.
 * back is where errors and the hold message are shown; it defaults to
 * /payouts and must be a path on this site.
 */
export function ConnectPayoutsButton({
  orgId,
  status = "not_started",
  back = "/payouts",
  className = "btn",
}: {
  orgId: string;
  status?: PayoutStatus | string;
  back?: string;
  className?: string;
}) {
  if (status === "held") return null;
  const label =
    status === "verified" ? "Open your Stripe payout dashboard" : status === "not_started" ? "Connect payouts" : "Continue with Stripe";
  return (
    <form action={connectPayouts} className="payout-connect-form">
      <input type="hidden" name="org" value={orgId} />
      <input type="hidden" name="back" value={back} />
      <button type="submit" className={className}>
        {label}
      </button>
    </form>
  );
}
