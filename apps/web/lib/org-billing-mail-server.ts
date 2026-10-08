import "server-only";
import { createMailer } from "@akana/emails";
import { mailLog } from "@/lib/mail-ops";
import {
  runOrgBillingMail,
  runOrgTermsReminders,
  type BillingContact,
  type DueOrgReminder,
  type OrgReminderRun,
  type OutboxRow,
  type OutboxRun,
  type Send,
} from "@/lib/org-billing-mail";
import { mailerEnvFromProcess } from "@/lib/partner-mail";
import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * The service-role side of organisation billing mail (0031). Used by the
 * daily job (app/api/org/billing-mail) and, best effort, by the Stripe
 * webhook straight after an organisation billing event, so a notice goes
 * out within seconds and the daily run picks up anything that failed.
 */

type Admin = ReturnType<typeof createAdminClient>;

class SqlError extends Error {
  constructor(public code: string | undefined) {
    super("sql_failed");
  }
}

function sender(admin: Admin): Send {
  const mailer = createMailer({
    env: mailerEnvFromProcess(),
    isSuppressed: () => false,
    log: mailLog("org_billing", "org_billing_mail"),
    async claim(key) {
      const { data, error } = await admin.rpc("claim_email", { p_key: key });
      if (error) throw new SqlError(error.code);
      return data === true;
    },
    async release(key) {
      const { error } = await admin.rpc("release_email", { p_key: key });
      if (error) console.error("org_billing_mail_release_failed", error.code ?? "unknown");
    },
  });
  return async (email, opts) => {
    const r = await mailer.sendOrganisation(email.template, email.props as never, { to: opts.to, userId: opts.userId, dedupeKey: opts.dedupeKey });
    return { status: r.status, reason: r.reason };
  };
}

function contactsOf(admin: Admin) {
  return async (orgId: string): Promise<BillingContact[]> => {
    const { data, error } = await admin.rpc("org_billing_contacts", { p_org: orgId });
    if (error) throw new SqlError(error.code);
    return ((data ?? []) as { user_id: string | null; email: string; role: string }[]).map((c) => ({ userId: c.user_id, email: c.email, role: c.role }));
  };
}

type OutboxDbRow = {
  id: string;
  kind: OutboxRow["kind"];
  org_id: string;
  organisation_name: string;
  consumer: boolean;
  relevant: boolean;
  invoice_number: string | null;
  amount_minor: number | null;
  currency: string | null;
  due_at: string | null;
  pay_url: string | null;
  grace_until: string | null;
  happens_at: string | null;
  refund_minor: number | null;
  refund_currency: string | null;
  refund_state: OutboxRow["refundState"];
};

/** Queue overdue invoices, then send every pending billing email. Throws on a database error. */
export async function sendOrgBillingMail(admin: Admin, origin: string, now = new Date()): Promise<OutboxRun & { overdue_queued: number }> {
  const q = await admin.rpc("org_billing_queue_overdue", { p_now: now.toISOString() });
  if (q.error) throw new SqlError(q.error.code);
  const run = await runOrgBillingMail({
    now,
    origin,
    supportEmail: process.env.EMAIL_REPLY_TO ?? "",
    async due() {
      const { data, error } = await admin.rpc("org_billing_mail_due", { p_limit: 200 });
      if (error) throw new SqlError(error.code);
      return ((data ?? []) as OutboxDbRow[]).map(
        (r): OutboxRow => ({
          id: r.id,
          kind: r.kind,
          orgId: r.org_id,
          organisationName: r.organisation_name,
          consumer: r.consumer,
          relevant: r.relevant,
          invoiceNumber: r.invoice_number,
          amountMinor: r.amount_minor,
          currency: r.currency ? r.currency.trim() : null,
          dueAt: r.due_at,
          payUrl: r.pay_url,
          graceUntil: r.grace_until,
          happensAt: r.happens_at,
          refundMinor: r.refund_minor,
          refundCurrency: r.refund_currency ? r.refund_currency.trim() : null,
          refundState: r.refund_state,
        }),
      );
    },
    contacts: contactsOf(admin),
    send: sender(admin),
    async done(id, done) {
      const { error } = await admin.rpc("org_billing_mail_done", { p_id: id, p_done: done });
      if (error) throw new SqlError(error.code);
    },
    log: (code, detail) => console.error(code, detail ?? ""),
  });
  return { ...run, overdue_queued: Number(q.data ?? 0) };
}

type DueDbRow = {
  stripe_subscription_id: string;
  org_id: string;
  organisation_name: string;
  yearly: boolean;
  seats: number;
  current_period_end: string;
  reminder_anchor_at: string;
  amount_minor: number | null;
  currency: string | null;
};

/** The DMCC reminder notices for consumer organisers. Throws on a database error. */
export async function sendOrgTermsReminders(admin: Admin, origin: string, now = new Date()): Promise<OrgReminderRun> {
  return runOrgTermsReminders({
    now,
    origin,
    supportEmail: process.env.EMAIL_REPLY_TO ?? "",
    async due(at) {
      const { data, error } = await admin.rpc("due_org_terms_reminders", { p_now: at.toISOString() });
      if (error) throw new SqlError(error.code);
      return ((data ?? []) as DueDbRow[]).map(
        (r): DueOrgReminder => ({
          subscriptionId: r.stripe_subscription_id,
          orgId: r.org_id,
          organisationName: r.organisation_name,
          yearly: r.yearly,
          seats: r.seats,
          currentPeriodEnd: r.current_period_end,
          reminderAnchorAt: r.reminder_anchor_at,
          amountMinor: r.amount_minor,
          currency: r.currency ? r.currency.trim() : null,
        }),
      );
    },
    contacts: contactsOf(admin),
    send: sender(admin),
    async markSent(subscriptionId, at) {
      const { error } = await admin.rpc("mark_org_terms_reminder_sent", { p_subscription: subscriptionId, p_at: at.toISOString() });
      if (error) throw new SqlError(error.code);
    },
    log: (code, detail) => console.error(code, detail ?? ""),
  });
}

export function isSqlError(e: unknown): e is SqlError {
  return e instanceof SqlError;
}

/** The public origin for links in organisation emails. */
export function mailOrigin(fallbackHost?: string | null): string {
  const host = process.env.AKANA_HOST ?? fallbackHost ?? "localhost:3000";
  return `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
}
