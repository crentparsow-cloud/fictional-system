import type Stripe from "stripe";
import type { StripeSettlementApi } from "@/lib/account-complete";
import type { StripeCoolingOffApi } from "@/lib/membership-refund";

/**
 * An in-memory stand-in for the Stripe billing calls the cooling-off refund,
 * the portal cancel and the deletion job's redaction make. Tests only: no
 * network, and app code never imports it.
 */

export type FakeSub = {
  id: string;
  status: string;
  customer: string;
  start_date: number;
  interval: "month" | "year";
  cancel_at_period_end: boolean;
  cancel_at: number | null;
  canceled_at: number | null;
};

export type FakeInvoice = {
  id: string;
  subscription: string;
  amount_paid: number;
  currency: string;
  billing_reason: string;
  paid_at: number | null;
  period: { start: number; end: number };
  payment: { payment_intent?: string; charge?: string } | null;
};

export type FakeRefund = { id: string; payment_intent?: string; charge?: string; amount: number; status: string; metadata: Record<string, string>; idempotencyKey?: string };

export type FakeCustomer = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  address: Record<string, string> | null;
  shipping: Record<string, unknown> | null;
  metadata: Record<string, string>;
  deleted?: boolean;
};

const missing = () => Object.assign(new Error("No such object"), { code: "resource_missing", statusCode: 404 });

export class FakeStripeBilling {
  subs = new Map<string, FakeSub>();
  /** Paid invoices, newest last. */
  invoices: FakeInvoice[] = [];
  refunds: FakeRefund[] = [];
  customers = new Map<string, FakeCustomer>();
  cancelled: string[] = [];
  updates: { id: string; params: Record<string, unknown> }[] = [];
  failRefund = false;
  failCancel = false;
  failUpdate = new Set<string>();
  private keys = new Map<string, FakeRefund>();

  api(): StripeSettlementApi & StripeCoolingOffApi {
    return {
      subscriptions: {
        retrieve: (async (id: string) => {
          const s = this.subs.get(id);
          if (!s) throw missing();
          return this.subObject(s);
        }) as unknown as StripeCoolingOffApi["subscriptions"]["retrieve"],
        cancel: (async (id: string) => {
          if (this.failCancel) throw Object.assign(new Error("api_connection_error"), { type: "StripeConnectionError" });
          const s = this.subs.get(id);
          if (!s) throw missing();
          s.status = "canceled";
          this.cancelled.push(id);
          return this.subObject(s);
        }) as unknown as StripeCoolingOffApi["subscriptions"]["cancel"],
      },
      invoices: {
        list: (async (p: { subscription: string; status: string }) => {
          const inv = this.invoices.filter((i) => i.subscription === p.subscription && p.status === "paid").at(-1);
          if (!inv) return { data: [] };
          return {
            data: [
              {
                id: inv.id,
                amount_paid: inv.amount_paid,
                currency: inv.currency,
                billing_reason: inv.billing_reason,
                status_transitions: { paid_at: inv.paid_at },
                period_start: inv.period.start - 1,
                period_end: inv.period.start,
                lines: { data: [{ period: inv.period }] },
              },
            ],
          };
        }) as unknown as StripeSettlementApi["invoices"]["list"],
      },
      invoicePayments: {
        list: (async (p: { invoice: string }) => {
          const inv = this.invoices.find((i) => i.id === p.invoice);
          return { data: inv?.payment ? [{ payment: { type: inv.payment.payment_intent ? "payment_intent" : "charge", ...inv.payment } }] : [] };
        }) as unknown as StripeSettlementApi["invoicePayments"]["list"],
      },
      refunds: {
        list: (async (p: { payment_intent?: string; charge?: string }) => ({
          data: this.refunds.filter((r) => (p.payment_intent ? r.payment_intent === p.payment_intent : r.charge === p.charge)),
        })) as unknown as StripeSettlementApi["refunds"]["list"],
        create: (async (params: { payment_intent?: string; charge?: string; amount: number; metadata: Record<string, string> }, opts?: { idempotencyKey?: string }) => {
          if (this.failRefund) throw Object.assign(new Error("Card issuer refused re_123 for cus_abc"), { code: "charge_disputed", type: "StripeInvalidRequestError" });
          const prior = opts?.idempotencyKey ? this.keys.get(opts.idempotencyKey) : undefined;
          if (prior) return prior;
          const r: FakeRefund = { id: `re_${this.refunds.length + 1}`, ...params, status: "pending", idempotencyKey: opts?.idempotencyKey };
          this.refunds.push(r);
          if (opts?.idempotencyKey) this.keys.set(opts.idempotencyKey, r);
          return r;
        }) as unknown as StripeSettlementApi["refunds"]["create"],
      },
      customers: {
        retrieve: (async (id: string) => this.customers.get(id) ?? { id, deleted: true }) as unknown as StripeSettlementApi["customers"]["retrieve"],
        update: (async (id: string, params: Record<string, unknown>) => {
          if (this.failUpdate.has(id)) throw Object.assign(new Error(`api_connection_error ${id}`), { type: "StripeConnectionError" });
          this.updates.push({ id, params });
          const c = this.customers.get(id)!;
          for (const k of ["name", "email", "phone", "address", "shipping"] as const) {
            if (k in params) (c as Record<string, unknown>)[k] = params[k] === "" ? null : params[k];
          }
          for (const [k, v] of Object.entries((params.metadata ?? {}) as Record<string, string>)) {
            if (v === "") delete c.metadata[k];
            else c.metadata[k] = v;
          }
          return c;
        }) as unknown as StripeSettlementApi["customers"]["update"],
      },
    };
  }

  private subObject(s: FakeSub): Stripe.Subscription {
    return {
      id: s.id,
      object: "subscription",
      status: s.status,
      customer: s.customer,
      start_date: s.start_date,
      cancel_at_period_end: s.cancel_at_period_end,
      cancel_at: s.cancel_at,
      canceled_at: s.canceled_at,
      ended_at: null,
      metadata: {},
      items: { data: [{ id: "si_1", current_period_end: 0, price: { id: `price_${s.interval}`, recurring: { interval: s.interval } } }] },
    } as unknown as Stripe.Subscription;
  }
}
