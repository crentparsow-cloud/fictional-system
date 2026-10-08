import type { SendLogEntry } from "@akana/emails";
import { reportOpsServer, type OpsReporter } from "@/lib/ops-report";

export type { OpsReporter } from "@/lib/ops-report";

/**
 * Ops alert wiring for every mailer path (F-142).
 *
 * Each mailer gets a log callback from mailLog() or withEmailOps(). It logs
 * the send as before and, when a send failed, records an email_failure ops
 * event with the mailer's source and the template name as the code. The
 * database opens an alert at 5 failures an hour per source (0016) and the
 * operator gets one email. No address, subject or provider message goes in.
 *
 * The ops alert email itself (lib/ops-alerts.ts) is not wrapped, so a broken
 * mail provider cannot loop alert into alert.
 *
 * Reporting goes through reportOpsServer (lib/ops-report.ts), which never
 * throws, so a report can never turn a handled failure into a worse one.
 */
type Log = (e: SendLogEntry) => Promise<void> | void;

/** Wraps a mailer log so a failed send is also reported as an email_failure. */
export function withEmailOps(source: string, log: Log, report: OpsReporter = reportOpsServer): (e: SendLogEntry) => Promise<void> {
  return async (e) => {
    try {
      await log(e);
    } catch {
      // a logging failure must not stop the report
    }
    if (e.status === "failed") await report("email_failure", source, e.template);
  };
}

/** The usual one-line console log plus the failure report. */
export function mailLog(source: string, label: string, report: OpsReporter = reportOpsServer): (e: SendLogEntry) => Promise<void> {
  return withEmailOps(source, (e) => console.info(label, e.template, e.status, e.reason ?? ""), report);
}
