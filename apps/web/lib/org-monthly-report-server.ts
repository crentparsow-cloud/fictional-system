import "server-only";
import { createMailer } from "@akana/emails";
import { mailLog } from "@/lib/mail-ops";
import { runMonthlyReport, type DigestRow, type ReportRun } from "@/lib/org-monthly-report";
import { mailerEnvFromProcess } from "@/lib/partner-mail";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

class SqlError extends Error {
  constructor(public code: string | undefined) {
    super("sql_failed");
  }
}

export function isReportSqlError(e: unknown): e is SqlError {
  return e instanceof SqlError;
}

type DigestDbRow = {
  org_id: string;
  organisation_name: string;
  seats_taken: number;
  people_started: number | null;
  groups_meeting: number;
  threshold: number;
};

/** Send last month's report to every organisation that has not switched it off. Throws on a database error. */
export async function sendOrgMonthlyReports(admin: Admin, origin: string, now = new Date()): Promise<ReportRun> {
  const mailer = createMailer({
    env: mailerEnvFromProcess(),
    isSuppressed: () => false,
    log: mailLog("org_billing", "org_monthly_report"),
    async claim(key) {
      const { data, error } = await admin.rpc("claim_email", { p_key: key });
      if (error) throw new SqlError(error.code);
      return data === true;
    },
    async release(key) {
      const { error } = await admin.rpc("release_email", { p_key: key });
      if (error) console.error("org_monthly_report_release_failed", error.code ?? "unknown");
    },
  });
  return runMonthlyReport({
    now,
    origin,
    supportEmail: process.env.EMAIL_REPLY_TO ?? "",
    async digest(month) {
      const { data, error } = await admin.rpc("org_report_digest", { p_month: month });
      if (error) throw new SqlError(error.code);
      return ((data ?? []) as DigestDbRow[]).map(
        (r): DigestRow => ({
          orgId: r.org_id,
          organisationName: r.organisation_name,
          seatsTaken: r.seats_taken,
          peopleStarted: r.people_started,
          groupsMeeting: r.groups_meeting,
          threshold: r.threshold,
        }),
      );
    },
    async recipients(orgId) {
      const { data, error } = await admin.rpc("org_report_recipients", { p_org: orgId });
      if (error) throw new SqlError(error.code);
      return ((data ?? []) as { user_id: string | null; email: string; role: string }[]).map((c) => ({ userId: c.user_id, email: c.email, role: c.role }));
    },
    async send(email, opts) {
      const { supportEmail, ...props } = email;
      const r = await mailer.sendOrganisation("org_monthly_report", { ...props, supportEmail }, { to: opts.to, userId: opts.userId, dedupeKey: opts.dedupeKey });
      return { status: r.status, reason: r.reason };
    },
    log: (code, detail) => console.error(code, detail ?? ""),
  });
}
