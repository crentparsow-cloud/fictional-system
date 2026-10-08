import { createHash } from "node:crypto";
import type { OrganisationProps, SendStatus } from "@akana/emails";
import { formatMinor } from "@/lib/money/format";
import { formatOrgDate } from "@/lib/org-pilot";
import { TERMS_REMINDER_LEAD_MIN_DAYS, withinTermsReminderWindow } from "@/lib/membership-reminders";

/**
 * Organisation billing emails and the consumer reminder notices (0031).
 * Pure runners over small dependencies, so they can be tested with fakes;
 * lib/org-billing-mail-server.ts wires them to the service role client.
 *
 * Billing emails. Triggers in 0031 queue one row in public.org_billing_mail
 * per event (invoice sent, payment failed, invoice overdue, licence
 * suspended, ending, ended). Each row goes to the organisation's owners,
 * finance contacts and billing address (app.org_billing_contacts), never to
 * a seat holder, and never names one. Each send claims
 * org_billing_mail:<row id>:<recipient> in public.email_claims, so a row is
 * sent once per person however often the job runs. A row is marked done
 * when every recipient has it, or when the event no longer holds (the
 * invoice was paid, access came back).
 *
 * Reminder notices (DMCC Act, consumer organisers only). A monthly plan:
 * once in every six months, 3 to 14 days before a payment, the same rule as
 * reader memberships (lib/membership-reminders.ts). A yearly plan: before
 * each renewal, 3 to 30 days ahead. The subscription is stamped once every
 * recipient has it.
 *
 * Logs and results carry counts only.
 */

export const YEARLY_REMINDER_LEAD_MAX_DAYS = 30;
const DAY_MS = 86_400_000;

export type BillingMailKind = "invoice_sent" | "payment_failed" | "invoice_overdue" | "licence_suspended" | "licence_ending" | "licence_ended";

/** A row from public.org_billing_mail_due(). */
export interface OutboxRow {
  id: string;
  kind: BillingMailKind;
  orgId: string;
  organisationName: string;
  consumer: boolean;
  relevant: boolean;
  invoiceNumber: string | null;
  amountMinor: number | null;
  currency: string | null;
  dueAt: string | null;
  payUrl: string | null;
  graceUntil: string | null;
  happensAt: string | null;
  refundMinor: number | null;
  refundCurrency: string | null;
  refundState: "pending" | "succeeded" | "failed" | null;
}

/** A row from public.org_billing_contacts(). */
export interface BillingContact {
  userId: string | null;
  email: string;
  role: string;
}

type BillingTemplate = "org_invoice_sent" | "org_payment_problem" | "org_licence_suspended" | "org_licence_ending" | "org_licence_ended" | "org_terms_reminder";
export type BillingEmail = { [K in BillingTemplate]: { template: K; props: OrganisationProps[K] } }[BillingTemplate];

export interface SendOpts {
  to: string;
  userId: string | null;
  dedupeKey: string;
}
export type Send = (email: BillingEmail, opts: SendOpts) => Promise<{ status: SendStatus; reason?: string }>;

/** The per-recipient part of a dedupe key: the user id, or a short hash of the billing address. Never an address. */
export function recipientKey(c: BillingContact): string {
  if (c.userId) return c.userId;
  return `b${createHash("sha256").update(c.email.trim().toLowerCase()).digest("hex").slice(0, 24)}`;
}

export function billingUrl(origin: string, orgId: string): string {
  return `${origin}/org/billing?org=${orgId}`;
}

const money = (minor: number | null, currency: string | null) => (minor !== null && currency ? formatMinor(minor, currency.trim()) : undefined);

/** The email for one outbox row. Null when the row cannot be written (an invoice amount missing). */
export function outboxEmail(row: OutboxRow, ctx: { origin: string; supportEmail: string; now: Date }): BillingEmail | null {
  const base = { organisationName: row.organisationName, supportEmail: ctx.supportEmail, billingUrl: billingUrl(ctx.origin, row.orgId) };
  const amount = money(row.amountMinor, row.currency);
  const payUrl = row.payUrl ?? undefined;
  const invoiceNumber = row.invoiceNumber ?? undefined;
  switch (row.kind) {
    case "invoice_sent":
      if (!amount || !row.dueAt) return null;
      return { template: "org_invoice_sent", props: { ...base, invoiceNumber, amount, dueOn: formatOrgDate(row.dueAt), payUrl } };
    case "payment_failed":
    case "invoice_overdue":
      return {
        template: "org_payment_problem",
        props: {
          ...base,
          mode: row.kind === "payment_failed" ? "failed" : "overdue",
          invoiceNumber,
          amount,
          accessUntil: row.graceUntil ? formatOrgDate(row.graceUntil) : undefined,
          payUrl,
        },
      };
    case "licence_suspended":
      return { template: "org_licence_suspended", props: { ...base } };
    case "licence_ending":
      return { template: "org_licence_ending", props: { ...base, endsOn: formatOrgDate(row.happensAt) || "the end of the period you have paid for", personal: row.consumer } };
    case "licence_ended":
      return {
        template: "org_licence_ended",
        props: {
          ...base,
          endedOn: formatOrgDate(row.happensAt ?? ctx.now.toISOString()),
          refundAmount: row.refundMinor && row.refundMinor > 0 ? money(row.refundMinor, row.refundCurrency) : undefined,
          refundStatus: row.refundState ?? undefined,
        },
      };
  }
}

export interface OutboxDeps {
  now: Date;
  origin: string;
  supportEmail: string;
  due(): Promise<OutboxRow[]>;
  contacts(orgId: string): Promise<BillingContact[]>;
  send: Send;
  /** public.org_billing_mail_done. */
  done(id: string, done: boolean): Promise<void>;
  log?(code: string, detail?: string): void;
}

export interface OutboxRun {
  rows: number;
  sent: number;
  already_sent: number;
  not_relevant: number;
  no_contacts: number;
  failed: number;
}

const went = (r: { status: SendStatus; reason?: string }) => r.status === "sent" || r.status === "sent_test";
const earlier = (r: { status: SendStatus; reason?: string }) => r.status === "skipped" && r.reason === "already_sent";

async function sendAll(email: BillingEmail, contacts: BillingContact[], keyBase: string, send: Send, run: { sent: number; already_sent: number }): Promise<boolean> {
  let ok = true;
  for (const c of contacts) {
    let r: { status: SendStatus; reason?: string };
    try {
      r = await send(email, { to: c.email, userId: c.userId, dedupeKey: `${keyBase}:${recipientKey(c)}` });
    } catch {
      r = { status: "failed" };
    }
    if (went(r)) run.sent += 1;
    else if (earlier(r)) run.already_sent += 1;
    else ok = false;
  }
  return ok;
}

/** Send every pending outbox row. One failure never stops the others. */
export async function runOrgBillingMail(deps: OutboxDeps): Promise<OutboxRun> {
  const run: OutboxRun = { rows: 0, sent: 0, already_sent: 0, not_relevant: 0, no_contacts: 0, failed: 0 };
  const rows = await deps.due();
  run.rows = rows.length;
  for (const row of rows) {
    const email = row.relevant ? outboxEmail(row, deps) : null;
    if (!email) {
      run.not_relevant += 1;
      await deps.done(row.id, true);
      continue;
    }
    const contacts = await deps.contacts(row.orgId);
    if (contacts.length === 0) {
      // An organisation already offboarded has nobody to tell.
      run.no_contacts += 1;
      await deps.done(row.id, true);
      continue;
    }
    const ok = await sendAll(email, contacts, `org_billing_mail:${row.id}`, deps.send, run);
    if (!ok) {
      run.failed += 1;
      deps.log?.("org_billing_mail_send_failed", row.kind);
    }
    await deps.done(row.id, ok);
  }
  return run;
}

// ---------------------------------------------------------------------------
// Reminder notices for consumer organisers
// ---------------------------------------------------------------------------

/** A row from public.due_org_terms_reminders(). */
export interface DueOrgReminder {
  subscriptionId: string;
  orgId: string;
  organisationName: string;
  yearly: boolean;
  seats: number;
  currentPeriodEnd: string;
  reminderAnchorAt: string;
  amountMinor: number | null;
  currency: string | null;
}

/** The timing rule again, in code: monthly as reader memberships, yearly 3 to 30 days ahead. */
export function orgReminderInWindow(r: Pick<DueOrgReminder, "yearly" | "currentPeriodEnd" | "reminderAnchorAt">, now: Date): boolean {
  const next = new Date(r.currentPeriodEnd);
  if (!r.yearly) return withinTermsReminderWindow(new Date(r.reminderAnchorAt), next, now);
  const lead = next.getTime() - now.getTime();
  return lead >= TERMS_REMINDER_LEAD_MIN_DAYS * DAY_MS && lead <= YEARLY_REMINDER_LEAD_MAX_DAYS * DAY_MS;
}

export function orgReminderDedupeBase(subscriptionId: string, nextPaymentIso: string): string {
  return `org_terms_reminder:${subscriptionId}:${nextPaymentIso.slice(0, 10)}`;
}

export interface OrgReminderDeps {
  now: Date;
  origin: string;
  supportEmail: string;
  due(now: Date): Promise<DueOrgReminder[]>;
  contacts(orgId: string): Promise<BillingContact[]>;
  send: Send;
  markSent(subscriptionId: string, at: Date): Promise<void>;
  log?(code: string, detail?: string): void;
}

export interface OrgReminderRun {
  due: number;
  sent: number;
  already_sent: number;
  no_price: number;
  not_due: number;
  no_contacts: number;
  failed: number;
  stamp_failed: number;
}

export async function runOrgTermsReminders(deps: OrgReminderDeps): Promise<OrgReminderRun> {
  const run: OrgReminderRun = { due: 0, sent: 0, already_sent: 0, no_price: 0, not_due: 0, no_contacts: 0, failed: 0, stamp_failed: 0 };
  const rows = await deps.due(deps.now);
  run.due = rows.length;
  for (const row of rows) {
    if (!orgReminderInWindow(row, deps.now)) {
      run.not_due += 1;
      continue;
    }
    // The notice must state the price: with no paid invoice yet, wait for a later run.
    if (row.amountMinor === null || !row.currency) {
      run.no_price += 1;
      continue;
    }
    const contacts = await deps.contacts(row.orgId);
    if (contacts.length === 0) {
      run.no_contacts += 1;
      continue;
    }
    const email: BillingEmail = {
      template: "org_terms_reminder",
      props: {
        organisationName: row.organisationName,
        supportEmail: deps.supportEmail,
        billingUrl: billingUrl(deps.origin, row.orgId),
        price: formatMinor(row.amountMinor, row.currency.trim()),
        yearly: row.yearly,
        nextDate: formatOrgDate(row.currentPeriodEnd),
        seats: row.seats,
      },
    };
    const ok = await sendAll(email, contacts, orgReminderDedupeBase(row.subscriptionId, row.currentPeriodEnd), deps.send, run);
    if (!ok) {
      run.failed += 1;
      deps.log?.("org_terms_reminder_send_failed");
      continue;
    }
    try {
      await deps.markSent(row.subscriptionId, deps.now);
    } catch {
      run.stamp_failed += 1;
      deps.log?.("org_terms_reminder_stamp_failed");
    }
  }
  return run;
}
