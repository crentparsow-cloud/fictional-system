import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/lib/brand";
import { formatMinor } from "@/lib/money/format";
import {
  billingNotice,
  billingStateText,
  CHURCH_BAND_PLANS,
  coolingOffText,
  isBandPlan,
  ORG_PLANS,
  isOrgPlanId,
  orgPriceId,
  TALK_TO_US,
  type CoolingOffState,
} from "@/lib/org-billing";
import { formatOrgDate, labelOf, LICENCE_KIND_LABELS, LICENCE_STATUS_LABELS } from "@/lib/org-pilot";
import { requireOrgConsole, withOrgParam } from "@/lib/org-pilot-server";
import { createUserClient } from "@/lib/supabase/server";
import { cancelCoolingOff, changeBand, changeSeats, endLicenceAction } from "./actions";

export const metadata: Metadata = { title: "Billing", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

interface Licence {
  id: string;
  kind: string;
  status: string;
  seats_purchased: number;
  starts_at: string;
  ends_at: string;
  billing_state: string | null;
  grace_until: string | null;
  end_requested_at: string | null;
  self_serve: boolean;
}
interface Sub {
  licence_id: string;
  stripe_subscription_id: string;
  status: string;
  plan: string | null;
  quantity: number;
  paid_quantity: number;
  collection_method: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}
interface Invoice {
  stripe_invoice_id: string;
  licence_id: string;
  number: string | null;
  status: string;
  payment_failed_at: string | null;
  currency: string;
  amount_due_minor: number;
  amount_paid_minor: number;
  tax_minor: number;
  po_number: string | null;
  due_at: string | null;
  paid_at: string | null;
  hosted_invoice_url: string | null;
  invoice_pdf_url: string | null;
  created_at: string;
}

const INVOICE_STATUS: Record<string, string> = {
  draft: "Draft",
  open: "To pay",
  paid: "Paid",
  void: "Cancelled",
  uncollectible: "Written off",
};

/**
 * Billing for the organisation (F-220, F-228). The owner and finance see
 * each licence's billing state, change seats on a per-seat plan, see their
 * invoices and download their records. The owner can end a licence. No
 * price appears here: prices are placeholders until Crent sets them, and
 * anything not priced is "Talk to us". Invoice amounts are the invoices
 * Stripe issued, nothing more.
 */
export default async function OrgBillingPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const ctx = await requireOrgConsole("/org/billing", sp.org);
  const canRead = ctx.org.role === "owner" || ctx.org.role === "finance";
  const isOwner = ctx.org.role === "owner";
  const notice = billingNotice(sp.notice);
  const supabase = await createUserClient();
  const q = (p: string) => withOrgParam(p, ctx.org.id, ctx.multi);

  let licences: Licence[] = [];
  let subs: Sub[] = [];
  let invoices: Invoice[] = [];
  let consumer = false;
  const cooling = new Map<string, { state: CoolingOffState; reason: string | null; closes_at: string | null }>();
  if (canRead) {
    const [l, s, i] = await Promise.all([
      supabase
        .from("org_licences")
        .select("id, kind, status, seats_purchased, starts_at, ends_at, billing_state, grace_until, end_requested_at, self_serve")
        .eq("org_id", ctx.org.id)
        .order("starts_at", { ascending: false }),
      supabase
        .from("org_subscriptions")
        .select("licence_id, stripe_subscription_id, status, plan, quantity, paid_quantity, collection_method, current_period_end, cancel_at_period_end")
        .eq("org_id", ctx.org.id),
      supabase
        .from("org_invoices")
        .select(
          "stripe_invoice_id, licence_id, number, status, payment_failed_at, currency, amount_due_minor, amount_paid_minor, tax_minor, po_number, due_at, paid_at, hosted_invoice_url, invoice_pdf_url, created_at",
        )
        .eq("org_id", ctx.org.id)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    licences = (l.data ?? []) as Licence[];
    subs = (s.data ?? []) as Sub[];
    invoices = (i.data ?? []) as Invoice[];
    // 0031: a personal plan (a consumer organiser) has a 14-day cooling-off and cancels here.
    const { data: prof } = await supabase.from("org_profiles").select("buyer_type").eq("org_id", ctx.org.id).maybeSingle();
    consumer = (prof?.buyer_type as string | undefined) === "consumer";
    if (consumer) {
      const billed = licences.filter((l) => l.status !== "ended" && subs.some((x) => x.licence_id === l.id));
      const states = await Promise.all(billed.map((l) => supabase.rpc("org_cooling_off_state", { p_licence: l.id })));
      billed.forEach((l, n) => {
        const row = (Array.isArray(states[n]!.data) ? states[n]!.data[0] : states[n]!.data) as
          | { state: CoolingOffState; reason: string | null; closes_at: string | null }
          | undefined;
        if (row) cooling.set(l.id, row);
      });
    }
  }

  return (
    <div className="admin-page studio-page org-console org-billing">
      <p className="muted studio-org">{ctx.org.displayName}</p>
      <h1>Billing</h1>
      {notice ? (
        <p className={`admin-notice admin-notice-${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
          {notice.text}
        </p>
      ) : null}

      {!canRead ? (
        <p className="admin-note">Billing is for the owner and the finance contact. Ask the owner if you need to see it.</p>
      ) : (
        <>
          {licences.length === 0 ? (
            <div className="card admin-empty">
              <h2>No licence yet</h2>
              <p className="muted">When a licence is set up, its billing shows here.</p>
            </div>
          ) : null}

          {licences.map((l) => {
            const sub = subs.find((s) => s.licence_id === l.id) ?? null;
            const plan = sub?.plan && isOrgPlanId(sub.plan) ? ORG_PLANS[sub.plan] : null;
            const ending = Boolean(l.end_requested_at) || Boolean(sub?.cancel_at_period_end);
            const perSeat = Boolean(sub && plan?.perSeat);
            const canChange = perSeat && l.status === "active" && !ending && sub && ["active", "trialing", "past_due"].includes(sub.status);
            return (
              <section key={l.id} className="card org-licence" aria-labelledby={`bill-${l.id}`}>
                <h2 id={`bill-${l.id}`}>
                  {labelOf(LICENCE_KIND_LABELS, l.kind)} licence{" "}
                  <span className={`badge admin-status admin-status-${l.status}`}>{labelOf(LICENCE_STATUS_LABELS, l.status)}</span>
                </h2>
                <p>
                  {billingStateText(
                    {
                      licenceStatus: l.status,
                      billingState: sub ? l.billing_state : null,
                      graceUntil: l.grace_until,
                      endRequested: Boolean(l.end_requested_at),
                      cancelAtPeriodEnd: Boolean(sub?.cancel_at_period_end),
                      periodEnd: sub?.current_period_end ?? null,
                      endsAt: l.ends_at,
                    },
                    (iso) => formatOrgDate(iso),
                  )}
                </p>
                <dl className="admin-dl">
                  <div>
                    <dt>Plan</dt>
                    <dd>{plan ? plan.label : sub ? "In Stripe" : l.kind === "pilot" ? "Pilot (free)" : "By invoice"}</dd>
                  </div>
                  <div>
                    <dt>Seats</dt>
                    <dd>{l.seats_purchased}</dd>
                  </div>
                  {sub && sub.quantity < sub.paid_quantity ? (
                    <div>
                      <dt>From your next renewal</dt>
                      <dd>{sub.quantity} seats</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>How you pay</dt>
                    <dd>{sub ? (sub.collection_method === "send_invoice" ? "Invoice, 30 days to pay" : "Card") : l.kind === "pilot" ? "Nothing to pay" : "Invoice from our team"}</dd>
                  </div>
                </dl>

                {canChange && sub ? (
                  <form className="admin-form" action={changeSeats}>
                    <input type="hidden" name="org" value={ctx.org.id} />
                    <input type="hidden" name="licence" value={l.id} />
                    <label htmlFor={`qty-${l.id}`}>Number of seats</label>
                    <input id={`qty-${l.id}`} name="quantity" type="number" inputMode="numeric" min={1} max={10000} defaultValue={sub.quantity} required />
                    <p className="muted small">
                      Adding seats starts now, and the extra cost for the rest of this period comes on its own invoice. Fewer seats take effect from your next
                      renewal, and you keep the seats you have paid for until then. You cannot go below the seats taken and the invitations waiting.
                    </p>
                    <button type="submit" className="btn secondary">
                      Change seats
                    </button>
                  </form>
                ) : null}

                {sub && plan && isBandPlan(plan.id) && l.status === "active" && !ending && ["active", "trialing"].includes(sub.status) ? (
                  <form className="admin-form" action={changeBand}>
                    <input type="hidden" name="org" value={ctx.org.id} />
                    <input type="hidden" name="licence" value={l.id} />
                    <label htmlFor={`band-${l.id}`}>Change band</label>
                    <select id={`band-${l.id}`} name="plan" defaultValue={plan.id} required>
                      {CHURCH_BAND_PLANS.map((b) => (
                        <option key={b} value={b} disabled={orgPriceId(b) === null}>
                          {ORG_PLANS[b].label}
                          {orgPriceId(b) === null ? `: ${TALK_TO_US.toLowerCase()}` : ""}
                        </option>
                      ))}
                    </select>
                    <p className="muted small">
                      A larger band starts now, and the difference for the rest of this period comes on its own invoice. A smaller band also starts now,
                      and the part you have not used comes off your next invoice. A band cannot be smaller than the places already taken and invited.
                    </p>
                    <button type="submit" className="btn secondary">
                      Change band
                    </button>
                  </form>
                ) : null}

                {consumer && isOwner && sub && l.status !== "ended" ? (
                  <section className="org-cancel" aria-labelledby={`cancel-${l.id}`}>
                    <h3 id={`cancel-${l.id}`}>Cancel your plan</h3>
                    <p>
                      Your plan renews automatically until you cancel. You can cancel here at any time. Everyone with a place keeps their account and
                      everything they wrote.
                    </p>
                    {cooling.get(l.id)?.state === "open" ? (
                      <form className="admin-form" action={cancelCoolingOff}>
                        <input type="hidden" name="org" value={ctx.org.id} />
                        <input type="hidden" name="licence" value={l.id} />
                        <p>{coolingOffText("open", cooling.get(l.id)?.reason ?? null, formatOrgDate(cooling.get(l.id)?.closes_at ?? null) || null)}</p>
                        <p className="muted small">Access ends today for everyone in the group. The refund goes back to the card you paid with.</p>
                        <div className="check">
                          <input id={`cool-${l.id}`} name="confirm" type="checkbox" value="yes" required />
                          <label htmlFor={`cool-${l.id}`}>Cancel now and refund the days I have not used</label>
                        </div>
                        <button type="submit" className="btn secondary">
                          Cancel now
                        </button>
                      </form>
                    ) : null}
                    {!ending ? (
                      <form className="admin-form" action={endLicenceAction}>
                        <input type="hidden" name="org" value={ctx.org.id} />
                        <input type="hidden" name="licence" value={l.id} />
                        <div className="check">
                          <input id={`end-${l.id}`} name="confirm" type="checkbox" value="yes" required />
                          <label htmlFor={`end-${l.id}`}>Cancel at the end of the period I have paid for</label>
                        </div>
                        <button type="submit" className="btn secondary">
                          Cancel at period end
                        </button>
                      </form>
                    ) : null}
                  </section>
                ) : null}

                {isOwner && !(consumer && sub) && l.status !== "ended" && !ending ? (
                  <details className="org-end">
                    <summary>End this licence</summary>
                    <p>
                      {sub
                        ? "The licence ends when the period you have paid for ends. Nothing more is charged."
                        : "The licence ends now. Nothing is refunded for time left on an invoice already paid."}{" "}
                      Everyone with a seat keeps their account and everything they wrote. It stays private, and they can still read it. They are told their
                      access through {ctx.org.displayName} has ended.
                    </p>
                    <p>
                      Download your records first if you need them: <Link href={`/org/export?kind=roster${ctx.multi ? `&org=${ctx.org.id}` : ""}`}>roster</Link>,{" "}
                      <Link href={`/org/export?kind=invoices${ctx.multi ? `&org=${ctx.org.id}` : ""}`}>invoices</Link> and{" "}
                      <Link href={`/org/export?kind=seats${ctx.multi ? `&org=${ctx.org.id}` : ""}`}>seat counts</Link>. 30 days after your last licence ends, we
                      delete your roster and the details of the people who run your account.
                    </p>
                    <form className="admin-form" action={endLicenceAction}>
                      <input type="hidden" name="org" value={ctx.org.id} />
                      <input type="hidden" name="licence" value={l.id} />
                      <div className="check">
                        <input id={`end-${l.id}`} name="confirm" type="checkbox" value="yes" required />
                        <label htmlFor={`end-${l.id}`}>I want to end this licence</label>
                      </div>
                      <button type="submit" className="btn secondary">
                        End licence
                      </button>
                    </form>
                  </details>
                ) : null}
              </section>
            );
          })}

          <section className="card" aria-labelledby="invoices-h">
            <h2 id="invoices-h">Invoices</h2>
            {invoices.length === 0 ? (
              <p className="muted">No invoices from Stripe yet. Invoices raised by our team by hand are sent to your billing contact.</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table" aria-labelledby="invoices-h">
                  <thead>
                    <tr>
                      <th scope="col">Invoice</th>
                      <th scope="col">Status</th>
                      <th scope="col">Amount</th>
                      <th scope="col">Due</th>
                      <th scope="col">Open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((i) => (
                      <tr key={i.stripe_invoice_id}>
                        <td>
                          {i.number ?? "Draft"}
                          {i.po_number ? <span className="muted small"> PO {i.po_number}</span> : null}
                        </td>
                        <td>
                          {INVOICE_STATUS[i.status] ?? i.status}
                          {i.payment_failed_at && i.status !== "paid" ? <span className="muted small"> A payment did not go through</span> : null}
                        </td>
                        <td>
                          {formatMinor(i.status === "paid" ? i.amount_paid_minor : i.amount_due_minor, i.currency)}
                          {i.tax_minor > 0 ? <span className="muted small"> including VAT {formatMinor(i.tax_minor, i.currency)}</span> : null}
                        </td>
                        <td>{i.status === "paid" ? `Paid ${formatOrgDate(i.paid_at)}` : formatOrgDate(i.due_at)}</td>
                        <td>
                          {i.hosted_invoice_url ? (
                            <a href={i.hosted_invoice_url} rel="noopener noreferrer" target="_blank">
                              View or pay
                            </a>
                          ) : null}
                          {i.invoice_pdf_url ? (
                            <>
                              {" "}
                              <a href={i.invoice_pdf_url} rel="noopener noreferrer" target="_blank">
                                PDF
                              </a>
                            </>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="muted small">The invoice is your VAT invoice. Pay by card, Bacs Direct Debit or the bank details on the invoice.</p>
          </section>

          <section className="card" aria-labelledby="export-h">
            <h2 id="export-h">Your records</h2>
            <p>Download as CSV. None of these hold anything a person wrote or how far anyone has got.</p>
            <ul>
              <li>
                <Link href={`/org/export?kind=roster${ctx.multi ? `&org=${ctx.org.id}` : ""}`}>Roster</Link>: the addresses you invited, and when seats were taken
                and released
              </li>
              <li>
                <Link href={`/org/export?kind=seats${ctx.multi ? `&org=${ctx.org.id}` : ""}`}>Seat counts</Link>: seats bought, taken and waiting, per licence
              </li>
              <li>
                <Link href={`/org/export?kind=invoices${ctx.multi ? `&org=${ctx.org.id}` : ""}`}>Invoices</Link>
              </li>
              <li>
                <Link href={q("/org/reports")}>Monthly reports</Link>, each with its own CSV
              </li>
            </ul>
          </section>

          <p className="admin-note">
            To change plan, move to invoice billing or add a licence, {TALK_TO_US.toLowerCase()}: contact the {brand.name} team.
          </p>
        </>
      )}
    </div>
  );
}
