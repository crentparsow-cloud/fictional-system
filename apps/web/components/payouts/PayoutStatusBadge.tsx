import { PAYOUT_STATUS_COPY, isPayoutStatus, type PayoutStatus } from "@/lib/payouts/status";

/**
 * The payout status as a small labelled badge (F-099): Not started, Being
 * checked, Verified, Action needed or Payouts on hold. Server component, no
 * script. Pass showDetail for the one-line explanation under it.
 */
export function PayoutStatusBadge({ status, showDetail = false }: { status: PayoutStatus | string; showDetail?: boolean }) {
  const s: PayoutStatus = isPayoutStatus(status) ? status : "not_started";
  const copy = PAYOUT_STATUS_COPY[s];
  return (
    <span className="payout-status">
      <span className={`payout-badge payout-badge-${s.replace("_", "-")}`}>{copy.label}</span>
      {showDetail ? <span className="payout-status-detail muted">{copy.detail}</span> : null}
    </span>
  );
}
