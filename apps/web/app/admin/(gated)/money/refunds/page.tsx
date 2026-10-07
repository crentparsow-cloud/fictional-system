import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatAdminDate } from "@/lib/admin/leads";
import { formatMinor } from "@/lib/money/format";
import { moneyAbilities } from "@/lib/money/permissions";
import { isTestKey } from "@/lib/money/reconcile";
import { classifyPurchaseQuery, REFUND_REASONS } from "@/lib/money/refund";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";
import { AdminBack } from "../../_components/Bits";
import { ModeBanner, MoneyNav, MoneyNotice } from "../MoneyBits";
import { refundPayment } from "./actions";

export const metadata: Metadata = { title: "Refunds", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

interface Found {
  target: "purchase" | "invoice";
  id: string;
  label: string;
  code: string | null;
  status: string;
  amountMinor: number;
  currency: string;
  paidAt: string | null;
  refundedMinor: number;
}

interface RefundReceipt {
  id: string;
  kind: string;
  source: string;
  stripe_ref: string;
  currency: string;
  gross_minor: number;
  reason: string | null;
  occurred_at: string;
}

/**
 * Refunds from the console (F-102). Find a payment by purchase id, Stripe
 * payment intent, checkout session or membership invoice id; refund all or
 * part of what is left. Shows ids, the AK code and amounts only: no reader
 * name or email. Owner and finance staff only.
 */
export default async function RefundsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await getStaffSession("/admin/money/refunds");
  const can = moneyAbilities(staff.roles);
  if (!can.read) notFound();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 200) : "";
  const query = q ? classifyPurchaseQuery(q) : null;
  const supabase = await createUserClient();
  const livemode = !isTestKey(process.env.STRIPE_SECRET_KEY);

  const found: Found[] = [];
  let searchFailed = false;
  if (query) {
    if (query.column === "stripe_invoice_id") {
      const { data, error } = await supabase
        .from("subscription_invoices")
        .select("id, stripe_invoice_id, status, amount_minor, currency, paid_at")
        .eq("stripe_invoice_id", query.value)
        .limit(1);
      if (error) searchFailed = true;
      for (const i of (data ?? []) as { id: string; stripe_invoice_id: string; status: string; amount_minor: number; currency: string; paid_at: string | null }[]) {
        found.push({ target: "invoice", id: i.id, label: `Membership invoice ${i.stripe_invoice_id}`, code: null, status: i.status, amountMinor: Number(i.amount_minor), currency: i.currency, paidAt: i.paid_at, refundedMinor: 0 });
      }
    } else {
      const { data, error } = await supabase
        .from("purchases")
        .select("id, kind, status, amount_minor, currency, paid_at, stripe_payment_intent_id, workbooks(code)")
        .eq(query.column, query.value)
        .limit(5);
      if (error) searchFailed = true;
      for (const p of (data ?? []) as unknown as {
        id: string;
        kind: string;
        status: string;
        amount_minor: number;
        currency: string;
        paid_at: string | null;
        workbooks: { code: string } | { code: string }[] | null;
      }[]) {
        const wb = Array.isArray(p.workbooks) ? p.workbooks[0] : p.workbooks;
        found.push({
          target: "purchase",
          id: p.id,
          label: p.kind === "workbook" ? "Single workbook" : "Membership checkout",
          code: wb?.code ?? null,
          status: p.status,
          amountMinor: Number(p.amount_minor),
          currency: p.currency,
          paidAt: p.paid_at,
          refundedMinor: 0,
        });
      }
    }
    // what the ledger already shows as refunded
    for (const f of found) {
      const col = f.target === "purchase" ? "purchase_id" : "subscription_invoice_id";
      const { data } = await supabase.from("royalty_receipts").select("gross_minor").eq(col, f.id).in("kind", ["refund", "dispute"]);
      f.refundedMinor = -((data ?? []) as { gross_minor: number }[]).reduce((s, r) => s + Number(r.gross_minor), 0);
    }
  }

  const { data: recentData } = await supabase
    .from("royalty_receipts")
    .select("id, kind, source, stripe_ref, currency, gross_minor, reason, occurred_at")
    .in("kind", ["refund", "dispute", "dispute_reversal"])
    .eq("livemode", livemode)
    .order("occurred_at", { ascending: false })
    .limit(20);
  const recent = (recentData ?? []) as RefundReceipt[];

  return (
    <div className="admin-page money-page">
      <AdminBack href="/admin/money" label="Money" />
      <h1>Refunds</h1>
      <MoneyNav current="/admin/money/refunds" />
      <MoneyNotice code={sp.notice} />
      <ModeBanner livemode={livemode} placeholder={false} />

      <form className="admin-search" method="get" role="search">
        <label htmlFor="refund-q">Find a payment</label>
        <div className="admin-search-row">
          <input id="refund-q" name="q" defaultValue={q} placeholder="Purchase id, pi_, cs_ or in_" maxLength={200} />
          <button type="submit" className="btn secondary">
            Find
          </button>
        </div>
        <p className="muted">Readers are never searched by name or email here. Ask them for the receipt or use the account lookup.</p>
      </form>

      {q && !query ? <p className="admin-notice admin-notice-error">That does not look like a purchase id or a Stripe id.</p> : null}
      {searchFailed ? <p className="admin-notice admin-notice-error">The search failed. Try again.</p> : null}
      {query && !searchFailed && found.length === 0 ? <p className="muted">Nothing found.</p> : null}

      {found.map((f) => {
        const left = Math.max(0, f.amountMinor - f.refundedMinor);
        const open = can.refund && (f.status === "paid" || (f.status === "refunded" && left > 0)) && left > 0;
        return (
          <section key={f.id} className="card money-refund" aria-label={f.label}>
            <h2>{f.label}</h2>
            <dl className="admin-dl">
              {f.code ? (
                <div>
                  <dt>Workbook</dt>
                  <dd>
                    <code>{f.code}</code>
                  </dd>
                </div>
              ) : null}
              <div>
                <dt>Status</dt>
                <dd>{f.status}</dd>
              </div>
              <div>
                <dt>Paid</dt>
                <dd>
                  {formatMinor(f.amountMinor, f.currency)} {f.paidAt ? `on ${formatAdminDate(f.paidAt)}` : ""}
                </dd>
              </div>
              <div>
                <dt>Refunded so far</dt>
                <dd>{formatMinor(f.refundedMinor, f.currency)}</dd>
              </div>
              <div>
                <dt>Record</dt>
                <dd>
                  <code>{f.id}</code>
                </dd>
              </div>
            </dl>
            {open ? (
              <form action={refundPayment} className="admin-form">
                <input type="hidden" name="target" value={f.target} />
                <input type="hidden" name="target_id" value={f.id} />
                <input type="hidden" name="q" value={q} />
                <fieldset>
                  <legend>How much</legend>
                  <label className="money-radio">
                    <input type="radio" name="scope" value="full" defaultChecked /> Everything left: {formatMinor(left, f.currency)}
                  </label>
                  <label className="money-radio">
                    <input type="radio" name="scope" value="partial" /> Part of it
                  </label>
                </fieldset>
                <label htmlFor={`amt-${f.id}`}>Amount for a partial refund ({f.currency})</label>
                <input id={`amt-${f.id}`} name="amount" inputMode="decimal" placeholder="4.50" />
                <label htmlFor={`why-${f.id}`}>Reason</label>
                <select id={`why-${f.id}`} name="reason" defaultValue="" required>
                  <option value="" disabled>
                    Choose a reason
                  </option>
                  {Object.entries(REFUND_REASONS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                {f.target === "purchase" ? (
                  <label className="money-radio">
                    <input type="checkbox" name="reclaim" value="yes" /> If the author has already been paid, reclaim their share from that payout now
                  </label>
                ) : (
                  <p className="muted">A membership refund leaves the membership running. Cancel it in Stripe if that is wanted too.</p>
                )}
                <p className="muted">
                  {f.target === "purchase"
                    ? "A full refund ends access to the workbook. The reader keeps their answers and export. The author's share is reversed in the ledger."
                    : "The refund comes out of the membership pool for the month it counted in, or the next open month."}
                </p>
                <button type="submit" className="btn">
                  Refund in Stripe
                </button>
              </form>
            ) : (
              <p className="muted">{can.refund ? "Nothing left to refund." : "Your role can view refunds but not make them."}</p>
            )}
          </section>
        );
      })}

      <h2>Recent refunds and disputes</h2>
      {recent.length === 0 ? (
        <p className="muted">None yet.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="admin-vh">Recent refunds and disputes</caption>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Kind</th>
                <th scope="col">Amount</th>
                <th scope="col">Reason</th>
                <th scope="col">Stripe</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id}>
                  <td>{formatAdminDate(r.occurred_at)}</td>
                  <td>
                    {r.kind === "dispute_reversal" ? "Dispute won" : r.kind === "dispute" ? "Dispute" : "Refund"}
                    {r.source === "membership" ? ", membership" : ""}
                  </td>
                  <td>{formatMinor(r.gross_minor, r.currency)}</td>
                  <td>{r.reason ?? ""}</td>
                  <td>
                    <code>{r.stripe_ref}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
