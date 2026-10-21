import type { SendStatus } from "@akana/emails";
import { recipientKey, type BillingContact } from "@/lib/org-billing-mail";

/**
 * The monthly report email to organisation owners and finance contacts (9.3).
 *
 * Pure runner over small dependencies, so it is tested with fakes. The server
 * side (lib/org-monthly-report-server.ts) wires it to the service role.
 *
 *  - Counts only. The numbers come from app.org_report_digest (0061), which
 *    already hides a started figure under the reporting threshold.
 *  - An organisation with fewer seat holders than the threshold gets no
 *    email, because even a seat count could point at one person.
 *  - The subject is fixed. No organisation name, no workbook title.
 *  - Each recipient is claimed per organisation and month in email_claims, so
 *    running the job twice sends nothing new.
 *  - Logs and results carry counts, never an address or a name.
 */

export interface MonthRef {
  /** First day of the month, yyyy-mm-dd, for the database. */
  start: string;
  /** yyyy-mm, for dedupe keys. */
  key: string;
  /** "September 2026". */
  label: string;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The calendar month before `now`, in London time. */
export function previousMonth(now: Date): MonthRef {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "numeric" }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const py = month === 1 ? year - 1 : year;
  const pm = month === 1 ? 12 : month - 1;
  const mm = String(pm).padStart(2, "0");
  return { start: `${py}-${mm}-01`, key: `${py}-${mm}`, label: `${MONTHS[pm - 1]} ${py}` };
}

export interface DigestRow {
  orgId: string;
  organisationName: string;
  seatsTaken: number;
  /** Null when under the threshold. */
  peopleStarted: number | null;
  groupsMeeting: number;
  threshold: number;
}

export interface ReportEmail {
  organisationName: string;
  reportsUrl: string;
  month: string;
  seatsTaken: number;
  peopleStarted: number | null;
  groupsMeeting: number;
  threshold: number;
  supportEmail: string;
}

export type ReportSend = (email: ReportEmail, opts: { to: string; userId: string | null; dedupeKey: string }) => Promise<{ status: SendStatus; reason?: string }>;

export interface ReportDeps {
  now: Date;
  origin: string;
  supportEmail: string;
  digest: (month: string) => Promise<DigestRow[]>;
  recipients: (orgId: string) => Promise<BillingContact[]>;
  send: ReportSend;
  log: (code: string, detail?: string) => void;
}

export interface ReportRun {
  month: string;
  organisations: number;
  skipped_small: number;
  no_contacts: number;
  sent: number;
  already_sent: number;
  failed: number;
}

export function reportsUrl(origin: string, orgId: string): string {
  return `${origin}/org/reports?org=${orgId}`;
}

export function reportDedupeKey(orgId: string, monthKey: string, c: BillingContact): string {
  return `org_monthly_report:${orgId}:${monthKey}:${recipientKey(c)}`;
}

export async function runMonthlyReport(deps: ReportDeps): Promise<ReportRun> {
  const month = previousMonth(deps.now);
  const run: ReportRun = { month: month.key, organisations: 0, skipped_small: 0, no_contacts: 0, sent: 0, already_sent: 0, failed: 0 };
  const rows = await deps.digest(month.start);
  run.organisations = rows.length;
  for (const row of rows) {
    if (row.seatsTaken < row.threshold) {
      run.skipped_small++;
      continue;
    }
    const contacts = await deps.recipients(row.orgId);
    if (contacts.length === 0) {
      run.no_contacts++;
      continue;
    }
    const email: ReportEmail = {
      organisationName: row.organisationName,
      reportsUrl: reportsUrl(deps.origin, row.orgId),
      month: month.label,
      seatsTaken: row.seatsTaken,
      peopleStarted: row.peopleStarted,
      groupsMeeting: row.groupsMeeting,
      threshold: row.threshold,
      supportEmail: deps.supportEmail,
    };
    for (const c of contacts) {
      let r: { status: SendStatus; reason?: string };
      try {
        r = await deps.send(email, { to: c.email, userId: c.userId, dedupeKey: reportDedupeKey(row.orgId, month.key, c) });
      } catch {
        r = { status: "failed" };
      }
      if (r.status === "sent" || r.status === "sent_test") run.sent++;
      else if (r.status === "skipped" && r.reason === "already_sent") run.already_sent++;
      else {
        run.failed++;
        deps.log("org_monthly_report_send_failed", r.reason ?? r.status);
      }
    }
  }
  return run;
}
