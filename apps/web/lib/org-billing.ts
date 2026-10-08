import type Stripe from "stripe";
import { toCsv } from "@/lib/dashboards";
import { plainMinor } from "@/lib/money/format";

/**
 * Akana for organisations, phase 3 (F-220, F-222, F-225, F-226, F-228).
 * Pure helpers: the plan catalogue, Stripe shapes into the 0030 function
 * arguments, which webhook events are organisation billing, the bulk
 * invite CSV, join link forms, the read-only wording and the export CSVs.
 *
 * STRIPE TEST MODE ONLY. Every price is a placeholder. The app shows no
 * figures: a plan whose price id env var is unset is "Talk to us", and
 * self-serve also waits for the org_self_serve flag (0030, seeded off).
 */

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export const ORG_PLAN_IDS = [
  "teams_seat_month",
  "teams_seat_year",
  "group_member_month",
  "church_band_1",
  "church_band_2",
  "church_band_3",
] as const;
export type OrgPlanId = (typeof ORG_PLAN_IDS)[number];

export interface OrgPlan {
  id: OrgPlanId;
  label: string;
  /** The org_licences.kind it bills. */
  licenceKind: "teams" | "group" | "church";
  /** The env var that holds the Stripe price id. */
  env: string;
  /** Per seat (quantity = seats) or one band (quantity 1). */
  perSeat: boolean;
  /** Offered through self-serve Checkout when the flag is on. */
  selfServe: boolean;
}

export const ORG_PLANS: Record<OrgPlanId, OrgPlan> = {
  teams_seat_month: { id: "teams_seat_month", label: "Teams, per seat, monthly", licenceKind: "teams", env: "STRIPE_PRICE_ORG_SEAT_MONTHLY", perSeat: true, selfServe: true },
  teams_seat_year: { id: "teams_seat_year", label: "Teams, per seat, yearly", licenceKind: "teams", env: "STRIPE_PRICE_ORG_SEAT_YEARLY", perSeat: true, selfServe: true },
  group_member_month: { id: "group_member_month", label: "Group, per member, monthly", licenceKind: "group", env: "STRIPE_PRICE_ORG_GROUP_MEMBER_MONTHLY", perSeat: true, selfServe: true },
  church_band_1: { id: "church_band_1", label: "Church, smallest band", licenceKind: "church", env: "STRIPE_PRICE_ORG_CHURCH_BAND_1", perSeat: false, selfServe: false },
  church_band_2: { id: "church_band_2", label: "Church, middle band", licenceKind: "church", env: "STRIPE_PRICE_ORG_CHURCH_BAND_2", perSeat: false, selfServe: false },
  church_band_3: { id: "church_band_3", label: "Church, largest band", licenceKind: "church", env: "STRIPE_PRICE_ORG_CHURCH_BAND_3", perSeat: false, selfServe: false },
};

export function isOrgPlanId(v: unknown): v is OrgPlanId {
  return typeof v === "string" && (ORG_PLAN_IDS as readonly string[]).includes(v);
}

type Env = Record<string, string | undefined>;

const PRICE_ID = /^price_[A-Za-z0-9]+$/;

/** The Stripe price id for a plan, or null ("Talk to us"). */
export function orgPriceId(plan: OrgPlanId, env: Env = process.env): string | null {
  const v = env[ORG_PLANS[plan].env]?.trim();
  return v && PRICE_ID.test(v) ? v : null;
}

/** The plan a price id belongs to, for an event that carries no plan metadata. */
export function orgPlanForPrice(priceId: string | null | undefined, env: Env = process.env): OrgPlanId | null {
  if (!priceId) return null;
  return ORG_PLAN_IDS.find((p) => orgPriceId(p, env) === priceId) ?? null;
}

/** Plans staff may put on a licence of this kind, with whether each has a price yet. */
export function plansForLicenceKind(kind: string, env: Env = process.env): { plan: OrgPlan; priced: boolean }[] {
  return ORG_PLAN_IDS.map((id) => ORG_PLANS[id])
    .filter((p) => p.licenceKind === kind)
    .map((plan) => ({ plan, priced: orgPriceId(plan.id, env) !== null }));
}

export const TALK_TO_US = "Talk to us";

/** Self-serve bounds. Placeholders, kept in step with 0030's app_config rows. */
export const SELF_SERVE_BOUNDS = { group: { min: 4, max: 15 }, teams: { min: 2, max: 25 } } as const;

// ---------------------------------------------------------------------------
// Stripe shapes into 0030 arguments
// ---------------------------------------------------------------------------

/** What akana_kind in Stripe metadata marks as organisation billing. */
export const ORG_META_KINDS = ["org_licence", "org_signup"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isOrgMeta(meta: Record<string, string> | null | undefined): boolean {
  return !!meta && (ORG_META_KINDS as readonly string[]).includes(meta.akana_kind ?? "");
}

function idOf(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

function iso(seconds: number | null | undefined): string | null {
  return typeof seconds === "number" && Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : null;
}

/** The metadata Stripe copies onto an invoice from its subscription. */
function invoiceMeta(invoice: Stripe.Invoice): Record<string, string> | null {
  return (invoice.parent?.subscription_details?.metadata as Record<string, string> | null | undefined) ?? null;
}

export function invoiceSubscriptionIdOf(invoice: Stripe.Invoice): string | null {
  const d = invoice.parent?.subscription_details;
  return d ? idOf(d.subscription as string | { id: string } | null) : null;
}

/**
 * True when an event is organisation billing and belongs to the 0030 module
 * rather than the reader membership code. Refunds and disputes are not:
 * they reach the ledger through the existing path, which finds the
 * organisation's receipt by its payment intent.
 */
export function isOrgBillingEvent(event: Pick<Stripe.Event, "type" | "data">): boolean {
  const obj = event.data.object as unknown;
  if (event.type.startsWith("checkout.session.")) {
    return isOrgMeta((obj as Stripe.Checkout.Session).metadata as Record<string, string> | null);
  }
  if (event.type.startsWith("customer.subscription.")) {
    return isOrgMeta((obj as Stripe.Subscription).metadata as Record<string, string> | null);
  }
  if (event.type.startsWith("invoice.")) {
    return isOrgMeta(invoiceMeta(obj as Stripe.Invoice));
  }
  return false;
}

export interface OrgSubscriptionArgs {
  p_subscription: string;
  p_customer: string;
  p_licence: string | null;
  p_status: string;
  p_plan: OrgPlanId | null;
  p_price: string | null;
  p_quantity: number;
  p_collection: "charge_automatically" | "send_invoice";
  p_days_until_due: number | null;
  p_period_start: string | null;
  p_period_end: string | null;
  p_cancel_at_period_end: boolean;
  p_cancel_at: string | null;
  p_canceled_at: string | null;
  p_ended_at: string | null;
  p_livemode: boolean;
  p_observed_at: string;
}

const SUB_STATUSES = ["incomplete", "incomplete_expired", "trialing", "active", "past_due", "canceled", "unpaid", "paused"];

/** A subscription as app.org_billing_apply wants it, or null when it cannot be stored. */
export function orgSubscriptionArgs(sub: Stripe.Subscription, observedAt: Date, env: Env = process.env): OrgSubscriptionArgs | null {
  if (!/^sub_[A-Za-z0-9]+$/.test(sub.id) || !SUB_STATUSES.includes(sub.status)) return null;
  const customer = idOf(sub.customer as string | { id: string } | null);
  if (!customer || !/^cus_[A-Za-z0-9]+$/.test(customer)) return null;
  const item = sub.items?.data?.[0];
  const meta = (sub.metadata ?? {}) as Record<string, string | undefined>;
  const priceId = item?.price?.id && PRICE_ID.test(item.price.id) ? item.price.id : null;
  const plan = isOrgPlanId(meta.plan) ? meta.plan : orgPlanForPrice(priceId, env);
  const quantity = Math.max(1, Math.min(10000, Math.trunc(item?.quantity ?? 1)));
  return {
    p_subscription: sub.id,
    p_customer: customer,
    p_licence: meta.licence_id && UUID.test(meta.licence_id) ? meta.licence_id : null,
    p_status: sub.status,
    p_plan: plan,
    p_price: priceId,
    p_quantity: quantity,
    p_collection: sub.collection_method === "send_invoice" ? "send_invoice" : "charge_automatically",
    p_days_until_due: typeof sub.days_until_due === "number" ? sub.days_until_due : null,
    p_period_start: iso(item?.current_period_start),
    p_period_end: iso(item?.current_period_end),
    p_cancel_at_period_end: Boolean(sub.cancel_at_period_end),
    p_cancel_at: iso(sub.cancel_at),
    p_canceled_at: iso(sub.canceled_at),
    p_ended_at: iso(sub.ended_at),
    p_livemode: Boolean(sub.livemode),
    p_observed_at: observedAt.toISOString(),
  };
}

export interface OrgInvoiceArgs {
  p_invoice: string;
  p_subscription: string;
  p_number: string | null;
  p_status: "draft" | "open" | "paid" | "void" | "uncollectible";
  p_payment_failed: boolean;
  p_currency: string;
  p_amount_due: number;
  p_amount_paid: number;
  p_tax: number;
  p_po: string | null;
  p_collection: string | null;
  p_billing_reason: string | null;
  p_period_start: string | null;
  p_period_end: string | null;
  p_due_at: string | null;
  p_paid_at: string | null;
  p_hosted_url: string | null;
  p_pdf_url: string | null;
  p_livemode: boolean;
  p_observed_at: string;
}

const INVOICE_STATUSES = ["draft", "open", "paid", "void", "uncollectible"] as const;

/** An invoice as app.org_billing_record_invoice wants it, or null. */
export function orgInvoiceArgs(invoice: Stripe.Invoice, observedAt: Date, paymentFailed: boolean): OrgInvoiceArgs | null {
  const sub = invoiceSubscriptionIdOf(invoice);
  if (!invoice.id || !/^in_[A-Za-z0-9]+$/.test(invoice.id) || !sub) return null;
  const status = (INVOICE_STATUSES as readonly string[]).includes(invoice.status ?? "") ? (invoice.status as OrgInvoiceArgs["p_status"]) : "open";
  const po = (invoice.custom_fields ?? []).find((f) => /^po/i.test(f.name))?.value ?? null;
  const paidAt = invoice.status_transitions?.paid_at ?? null;
  return {
    p_invoice: invoice.id,
    p_subscription: sub,
    p_number: invoice.number ?? null,
    p_status: status,
    p_payment_failed: paymentFailed,
    p_currency: (invoice.currency ?? "gbp").toUpperCase(),
    p_amount_due: invoice.amount_due ?? 0,
    p_amount_paid: invoice.amount_paid ?? 0,
    p_tax: (invoice.total_taxes ?? []).reduce((sum, t) => sum + (t.amount ?? 0), 0),
    p_po: po ? po.slice(0, 60) : null,
    p_collection: invoice.collection_method ?? null,
    p_billing_reason: invoice.billing_reason ?? null,
    p_period_start: iso(invoice.period_start),
    p_period_end: iso(invoice.period_end),
    p_due_at: iso(invoice.due_date),
    p_paid_at: iso(paidAt),
    p_hosted_url: invoice.hosted_invoice_url ?? null,
    p_pdf_url: invoice.invoice_pdf ?? null,
    p_livemode: Boolean(invoice.livemode),
    p_observed_at: observedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Bulk invite CSV (F-225)
// ---------------------------------------------------------------------------

export const CSV_MAX_ROWS = 200;
export const CSV_MAX_BYTES = 64 * 1024;
const EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

export interface InviteCsv {
  valid: string[];
  invalid: { line: number; value: string }[];
  duplicates: number;
  /** More rows than CSV_MAX_ROWS: the rest were not read. */
  truncated: boolean;
}

/**
 * Read a CSV of email addresses. One address per row; the first cell that
 * looks like an address is taken, so a column of names next to it is
 * ignored. A header row ("email") is skipped. Nothing else is kept.
 */
export function parseInviteCsv(text: string, max: number = CSV_MAX_ROWS): InviteCsv {
  const out: InviteCsv = { valid: [], invalid: [], duplicates: 0, truncated: false };
  const seen = new Set<string>();
  const lines = text.replace(/^﻿/, "").split(/\r\n|\n|\r/);
  let rows = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    const cells = line.split(/[,;\t]/).map((c) => c.trim().replace(/^"(.*)"$/, "$1").trim());
    if (rows === 0 && cells.some((c) => /^e-?mail( address)?$/i.test(c))) continue;
    rows++;
    if (rows > max) {
      out.truncated = true;
      break;
    }
    const hit = cells.find((c) => c.includes("@"));
    const email = (hit ?? "").toLowerCase();
    if (!email || email.length > 254 || !EMAIL.test(email)) {
      out.invalid.push({ line: i + 1, value: (hit ?? cells[0] ?? "").slice(0, 80) });
      continue;
    }
    if (seen.has(email)) {
      out.duplicates++;
      continue;
    }
    seen.add(email);
    out.valid.push(email);
  }
  return out;
}

/** The addresses carried from the preview to the send, re-checked. */
export function parseInviteList(v: unknown, max: number = CSV_MAX_ROWS): string[] | null {
  if (typeof v !== "string" || v.length > max * 260) return null;
  const list = v.split("\n").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (list.length === 0 || list.length > max) return null;
  if (list.some((e) => e.length > 254 || !EMAIL.test(e))) return null;
  return Array.from(new Set(list));
}

// ---------------------------------------------------------------------------
// Join links (F-225)
// ---------------------------------------------------------------------------

export interface JoinLinkInput {
  days: number;
  maxUses: number;
  domain: string | null;
}

const DOMAIN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export function parseJoinLinkForm(get: (k: string) => unknown, seats: number): JoinLinkInput | null {
  const days = Number(String(get("days") ?? "").trim());
  const cap = Number(String(get("max_uses") ?? "").trim());
  const raw = String(get("domain") ?? "").trim().toLowerCase().replace(/^@/, "");
  if (!Number.isInteger(days) || days < 1 || days > 90) return null;
  if (!Number.isInteger(cap) || cap < 1 || cap > seats) return null;
  if (raw && (raw.length > 253 || !DOMAIN.test(raw))) return null;
  return { days, maxUses: cap, domain: raw || null };
}

export function joinLinkUrl(origin: string, token: string): string {
  return `${origin}/org/link/${token}`;
}

export type JoinLinkState = "ok" | "unknown" | "expired" | "revoked" | "closed" | "full";

export function joinLinkCopy(state: Exclude<JoinLinkState, "ok">): { title: string; body: string } {
  switch (state) {
    case "expired":
      return { title: "This link has expired", body: "Ask your organisation for a new one." };
    case "revoked":
      return { title: "This link was closed", body: "Ask your organisation for a new one if you still need a place." };
    case "closed":
      return { title: "This link can't be used now", body: "Your organisation's access is paused or has ended." };
    case "full":
      return { title: "No places left on this link", body: "Ask your organisation whether more places can be added." };
    default:
      return { title: "This link isn't working", body: "It may have been copied only in part. Try the link again." };
  }
}

export function linkClaimErrorCode(code: string | undefined): "adult" | "closed" | "deletion" | "full" | "domain" | "blocked" | "busy" | "failed" {
  switch (code) {
    case "AKO10":
      return "adult";
    case "AKO04":
    case "AKO08":
      return "closed";
    case "AKO06":
      return "deletion";
    case "AKO07":
    case "AKO12":
      return "full";
    case "AKO11":
      return "domain";
    case "AKO09":
      return "blocked";
    case "AKO29":
      return "busy";
    default:
      return "failed";
  }
}

export const LINK_CLAIM_ERRORS: Record<string, string> = {
  adult: "Tick the box to confirm you are 18 or over.",
  closed: "This link can no longer be used.",
  deletion: "Your account is set to be deleted, so it can't take a place. Cancel the deletion on the You page first.",
  full: "There are no places left. Ask your organisation.",
  domain: "This link is for one email domain. Sign in with your address on that domain.",
  blocked: "This address asked not to be invited by this organisation.",
  busy: "Many people used this link in the last hour. Please try again later.",
  failed: "That didn't work just now. Please try again.",
};

// ---------------------------------------------------------------------------
// Billing wording
// ---------------------------------------------------------------------------

export interface BillingView {
  licenceStatus: string;
  billingState: string | null;
  graceUntil: string | null;
  endRequested: boolean;
  cancelAtPeriodEnd: boolean;
  periodEnd: string | null;
  endsAt: string;
}

/** One line on where the licence's billing stands. Plain, never alarming. */
export function billingStateText(v: BillingView, fmt: (iso: string | null) => string): string {
  if (v.licenceStatus === "ended") return "This licence has ended.";
  if (v.endRequested || v.cancelAtPeriodEnd) return `Ending. Access continues until ${fmt(v.periodEnd ?? v.endsAt)}, then the licence ends.`;
  switch (v.billingState) {
    case "past_due":
      return `A payment is overdue. Access continues until ${fmt(v.graceUntil ?? v.endsAt)}. Paying the invoice keeps it going.`;
    case "unpaid":
    case "paused":
    case "incomplete":
      return "Access is paused until the payment goes through.";
    case "active":
    case "trialing":
      return `Paid up. Renews on ${fmt(v.periodEnd)}.`;
    case null:
      return "Billed by invoice, arranged with you directly.";
    default:
      return "Billing status not known yet.";
  }
}

export const BILLING_NOTICES = {
  seats_up: { tone: "ok", text: "Seats added. The extra cost for the rest of this period is on a new invoice." },
  seats_down: { tone: "ok", text: "Seats lowered from your next renewal. You keep the seats you paid for until then." },
  seats_same: { tone: "ok", text: "No change: that is the number you have." },
  ending: { tone: "ok", text: "Your licence will end at the end of the period you have paid for." },
  ended: { tone: "ok", text: "Your licence has ended. Members keep their accounts and their work." },
  link_made: { tone: "ok", text: "Link made. Copy it now: it is shown only once." },
  link_closed: { tone: "ok", text: "Link closed. It no longer works." },
  csv_sent: { tone: "ok", text: "Invitations sent." },
  billing_started: { tone: "ok", text: "Billing started in Stripe (test mode). The first invoice is on 30-day terms." },
  not_priced: { tone: "error", text: "That plan has no price yet. Talk to us." },
  stripe_off: { tone: "error", text: "Stripe is not set up here, or it is not in test mode. Nothing changed." },
  stripe_failed: { tone: "error", text: "Stripe did not accept that. Nothing changed." },
  denied: { tone: "error", text: "Your role cannot do that. Nothing changed." },
  invalid: { tone: "error", text: "Check the form. Something is missing or does not fit." },
  state: { tone: "error", text: "That cannot be done in the licence's current state. Nothing changed." },
  limited: { tone: "error", text: "Too many for now. Try again tomorrow." },
  failed: { tone: "error", text: "That did not save. Try again." },
} as const satisfies Record<string, { tone: "ok" | "error"; text: string }>;
export type BillingNotice = keyof typeof BILLING_NOTICES;

export function billingNotice(code: string | string[] | undefined): { tone: "ok" | "error"; text: string } | null {
  const k = Array.isArray(code) ? code[0] : code;
  return k && Object.prototype.hasOwnProperty.call(BILLING_NOTICES, k) ? BILLING_NOTICES[k as BillingNotice] : null;
}

export function billingErrorNotice(code: string | undefined): BillingNotice {
  switch (code) {
    case "AKO01":
    case "42501":
      return "denied";
    case "AKO02":
      return "invalid";
    case "AKO08":
    case "AKO05":
      return "state";
    case "AKO14":
      return "state";
    case "AKO29":
      return "limited";
    default:
      return "failed";
  }
}

/** The member's notice after an organisation's licence ends (F-228). */
export function endedSeatText(orgName: string, endedOn: string): string {
  return `Your access through ${orgName} ended on ${endedOn}. Everything you wrote is still yours and still private. You can read it, but not add to it, unless you get access another way.`;
}

// ---------------------------------------------------------------------------
// Export CSVs (F-228). Never answers, never progress per person.
// ---------------------------------------------------------------------------

export interface RosterRow {
  licence_kind: string;
  licence_starts_at: string;
  licence_ends_at: string;
  roster_email: string | null;
  joined_by: string;
  claimed_at: string;
  released_at: string | null;
  released_reason: string | null;
}

const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "");

export function rosterCsv(rows: readonly RosterRow[]): string {
  return toCsv(
    ["licence", "licence_starts", "licence_ends", "email", "joined_by", "seat_taken", "seat_released", "released_reason"],
    rows.map((r) => [
      r.licence_kind,
      day(r.licence_starts_at),
      day(r.licence_ends_at),
      r.roster_email ?? (r.joined_by === "link" ? "joined with a link" : "address removed"),
      r.joined_by,
      day(r.claimed_at),
      day(r.released_at),
      r.released_reason ?? "",
    ]),
  );
}

export interface InvoiceRow {
  number: string | null;
  status: string;
  currency: string;
  amount_due_minor: number;
  amount_paid_minor: number;
  tax_minor: number;
  po_number: string | null;
  period_start: string | null;
  period_end: string | null;
  due_at: string | null;
  paid_at: string | null;
  livemode: boolean;
}

export function invoicesCsv(rows: readonly InvoiceRow[]): string {
  return toCsv(
    ["number", "status", "currency", "amount_due", "amount_paid", "vat", "po_number", "period_start", "period_end", "due", "paid", "mode"],
    rows.map((r) => [
      r.number ?? "",
      r.status,
      r.currency,
      plainMinor(r.amount_due_minor),
      plainMinor(r.amount_paid_minor),
      plainMinor(r.tax_minor),
      r.po_number ?? "",
      day(r.period_start),
      day(r.period_end),
      day(r.due_at),
      day(r.paid_at),
      r.livemode ? "live" : "test",
    ]),
  );
}

export interface SeatSummaryRow {
  kind: string;
  status: string;
  starts_at: string;
  ends_at: string;
  seats_purchased: number;
  seats_claimed: number;
  invitations_open: number;
  people_started: number | null;
  started_shown: string;
  threshold: number;
}

export function seatSummaryCsv(rows: readonly SeatSummaryRow[]): string {
  return toCsv(
    ["licence", "status", "starts", "ends", "seats_bought", "seats_taken", "invitations_waiting", "people_started"],
    rows.map((r) => [
      r.kind,
      r.status,
      day(r.starts_at),
      day(r.ends_at),
      r.seats_purchased,
      r.seats_claimed,
      r.invitations_open,
      r.started_shown === "exact" && r.people_started !== null
        ? r.people_started
        : r.started_shown === "at_least" && r.people_started !== null
          ? `at least ${r.people_started}`
          : `fewer than ${r.threshold} or not shown`,
    ]),
  );
}

// ---------------------------------------------------------------------------
// Self-serve form (F-226)
// ---------------------------------------------------------------------------

export interface SignupInput {
  plan: "group_member_month" | "teams_seat_month" | "teams_seat_year";
  orgKind: "community_group" | "business" | "charity";
  name: string;
  quantity: number;
}

export function parseSignupForm(get: (k: string) => unknown): SignupInput | null {
  const plan = String(get("plan") ?? "");
  const orgKind = String(get("org_kind") ?? "");
  const name = String(get("name") ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  const quantity = Number(String(get("quantity") ?? "").trim());
  if (plan !== "group_member_month" && plan !== "teams_seat_month" && plan !== "teams_seat_year") return null;
  if (get("adult") !== "yes" || get("renews") !== "yes") return null;
  if (!name || name.length > 120 || /[<>]/.test(name)) return null;
  const bounds = plan === "group_member_month" ? SELF_SERVE_BOUNDS.group : SELF_SERVE_BOUNDS.teams;
  if (!Number.isInteger(quantity) || quantity < bounds.min || quantity > bounds.max) return null;
  if (plan === "group_member_month" && orgKind !== "community_group") return null;
  if (plan !== "group_member_month" && orgKind !== "business" && orgKind !== "charity") return null;
  return { plan, orgKind: orgKind as SignupInput["orgKind"], name, quantity };
}
