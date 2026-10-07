/**
 * Ops alert labels for /admin/ops (F-142). Pure.
 */

export const OPS_KINDS = ["webhook_failure", "cron_failure", "payout_failure", "email_failure", "validator_error", "error"] as const;
export type OpsKind = (typeof OPS_KINDS)[number];

export const OPS_KIND_LABELS: Record<OpsKind, string> = {
  webhook_failure: "Webhook failure",
  cron_failure: "Scheduled job failure",
  payout_failure: "Payout failure",
  email_failure: "Email failures",
  validator_error: "Validator error",
  error: "Error spike",
};

export function opsKindLabel(kind: string): string {
  return (OPS_KIND_LABELS as Record<string, string>)[kind] ?? kind;
}

/** Mirrors app.ops_threshold in migration 0016, for the explanation on the page. */
export const OPS_THRESHOLDS: Record<OpsKind, string> = {
  webhook_failure: "Alerts on the first failure.",
  cron_failure: "Alerts on the first failure.",
  payout_failure: "Alerts on the first failure.",
  email_failure: "Alerts at 5 failures in an hour.",
  validator_error: "Alerts on the first failure.",
  error: "Alerts at 10 errors in 15 minutes from one place.",
};

/** The instant N days before now, as an ISO string. */
export function daysAgoIso(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}
