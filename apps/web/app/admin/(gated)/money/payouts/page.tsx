import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatAdminDate } from "@/lib/admin/leads";
import { currentConfig } from "@/lib/money/db";
import { formatMinor, labelOf, PAYOUT_REASON_LABELS } from "@/lib/money/format";
import { moneyAbilities } from "@/lib/money/permissions";
import { isTestKey } from "@/lib/money/reconcile";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";
import { AdminBack } from "../../_components/Bits";
import { ModeBanner, MoneyNav, MoneyNotice } from "../MoneyBits";
import { approvePayout, placeHold, releaseHold, runPayoutsNow } from "./actions";

export const metadata: Metadata = { title: "Payouts", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

interface Candidate {
  org_id: string;
  org_name: string;
  currency: string;
  balance_minor: number;
  payable_minor: number;
  decision: string;
  reason: string;
}

interface PayoutRow {
  id: string;
  org_id: string;
  currency: string;
  amount_minor: number;
  status: string;
  stripe_transfer_id: string | null;
  reversed_minor: number;
  failure_code: string | null;
  created_at: string;
  paid_at: string | null;
}

interface HoldRow {
  id: string;
  org_id: string;
  reason: string;
  placed_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  awaiting_approval: "Waiting for approval",
  pending: "Being paid",
  paid: "Paid",
  failed: "Refused by Stripe",
  cancelled: "Cancelled",
};

/**
 * Payouts, holds and fraud controls (F-103). What the next run would do for
 * each organisation and why, payouts waiting for a person, holds, and
 * recent transfers. Runs and approvals work with a test-mode key only.
 */
export default async function PayoutsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await getStaffSession("/admin/money/payouts");
  const can = moneyAbilities(staff.roles);
  if (!can.read) notFound();
  const sp = await searchParams;
  const supabase = await createUserClient();
  const testKey = isTestKey(process.env.STRIPE_SECRET_KEY);
  const livemode = !testKey;

  const [candRes, payoutsRes, holdsRes, orgsRes] = await Promise.all([
    supabase.rpc("payout_candidates", { p_livemode: livemode }),
    supabase
      .from("payouts")
      .select("id, org_id, currency, amount_minor, status, stripe_transfer_id, reversed_minor, failure_code, created_at, paid_at")
      .eq("livemode", livemode)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("payout_holds").select("id, org_id, reason, placed_at").is("released_at", null).order("placed_at", { ascending: false }),
    supabase.from("organisations").select("id, display_name, kind, is_demo").order("display_name").limit(500),
  ]);
  for (const [tag, r] of [["candidates", candRes], ["payouts", payoutsRes], ["holds", holdsRes], ["orgs", orgsRes]] as const) {
    if (r.error) console.error(`money_payouts_${tag}_failed`, r.error.code ?? "");
  }
  let config = null;
  try {
    config = await currentConfig(supabase);
  } catch {
    config = null;
  }
  const candidates = (candRes.data ?? []) as Candidate[];
  const payouts = (payoutsRes.data ?? []) as PayoutRow[];
  const holds = (holdsRes.data ?? []) as HoldRow[];
  const orgs = (orgsRes.data ?? []) as { id: string; display_name: string; kind: string; is_demo: boolean }[];
  const orgName = new Map(orgs.map((o) => [o.id, o.display_name]));
  const waiting = payouts.filter((p) => p.status === "awaiting_approval");
  const payableOrgs = orgs.filter((o) => o.kind !== "akana_house" && !o.is_demo);

  return (
    <div className="admin-page money-page">
      <AdminBack href="/admin/money" label="Money" />
      <h1>Payouts</h1>
      <MoneyNav current="/admin/money/payouts" />
      <MoneyNotice code={sp.notice} />
      <ModeBanner livemode={livemode} placeholder={config?.is_placeholder ?? true} />
      <p className="muted">
        The run happens on day {config?.payout_day ?? "?"} of each month, London time. Only money in closed months is paid, never more than the whole
        balance. Each payout is one Stripe transfer to the organisation&apos;s Connect account.
      </p>

      {can.runPayouts ? (
        <form action={runPayoutsNow} className="admin-actions">
          <button type="submit" className="btn" disabled={!testKey}>
            Run payouts now (test mode)
          </button>
          {!testKey ? <span className="muted">Locked: the Stripe key is not a test key.</span> : null}
        </form>
      ) : null}

      <section aria-labelledby="pay-next-h">
        <h2 id="pay-next-h">What the next run would do</h2>
        {candidates.length === 0 ? (
          <p className="muted">No organisation has a balance yet.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <caption className="admin-vh">Payout decisions by organisation and currency</caption>
              <thead>
                <tr>
                  <th scope="col">Organisation</th>
                  <th scope="col">Balance</th>
                  <th scope="col">Payable</th>
                  <th scope="col">Decision</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => (
                  <tr key={`${c.org_id}-${c.currency}`}>
                    <td>{c.org_name}</td>
                    <td>{formatMinor(c.balance_minor, c.currency)}</td>
                    <td>{formatMinor(c.payable_minor, c.currency)}</td>
                    <td>
                      <span className={`badge money-decision money-decision-${c.decision}`}>
                        {c.decision === "pay" ? "Pay" : c.decision === "approve" ? "Approve" : "Skip"}
                      </span>{" "}
                      {labelOf(PAYOUT_REASON_LABELS, c.reason)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {waiting.length ? (
        <section aria-labelledby="pay-wait-h">
          <h2 id="pay-wait-h">Waiting for approval</h2>
          <ul className="review-list">
            {waiting.map((p) => (
              <li key={p.id} className="card">
                <p>
                  <strong>{orgName.get(p.org_id) ?? p.org_id.slice(0, 8)}</strong>: {formatMinor(p.amount_minor, p.currency)}
                </p>
                {can.approve ? (
                  <form action={approvePayout}>
                    <input type="hidden" name="payout" value={p.id} />
                    <button type="submit" className="btn" disabled={!testKey}>
                      Approve and pay
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="pay-holds-h">
        <h2 id="pay-holds-h">Holds</h2>
        {holds.length === 0 ? (
          <p className="muted">No organisation is on hold.</p>
        ) : (
          <ul className="review-list">
            {holds.map((h) => (
              <li key={h.id} className="card">
                <p>
                  <strong>{orgName.get(h.org_id) ?? h.org_id.slice(0, 8)}</strong>, held {formatAdminDate(h.placed_at)}
                </p>
                <p className="admin-message">{h.reason}</p>
                {can.holds ? (
                  <form action={releaseHold} className="admin-form">
                    <input type="hidden" name="hold" value={h.id} />
                    <label htmlFor={`rel-${h.id}`}>Why it can be released</label>
                    <input id={`rel-${h.id}`} name="note" maxLength={500} />
                    <button type="submit" className="btn secondary">
                      Release hold
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {can.holds ? (
          <form action={placeHold} className="admin-form card admin-create">
            <h3>Hold an organisation&apos;s payouts</h3>
            <label htmlFor="hold-org">Organisation</label>
            <select id="hold-org" name="org" defaultValue="" required>
              <option value="" disabled>
                Choose an organisation
              </option>
              {payableOrgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.display_name}
                </option>
              ))}
            </select>
            <label htmlFor="hold-reason">Reason</label>
            <input id="hold-reason" name="reason" minLength={3} maxLength={500} required />
            <button type="submit" className="btn">
              Hold payouts
            </button>
          </form>
        ) : null}
      </section>

      <section aria-labelledby="pay-recent-h">
        <h2 id="pay-recent-h">Recent payouts</h2>
        {payouts.length === 0 ? (
          <p className="muted">None yet.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <caption className="admin-vh">Recent payouts</caption>
              <thead>
                <tr>
                  <th scope="col">Organisation</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Status</th>
                  <th scope="col">Transfer</th>
                  <th scope="col">When</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => (
                  <tr key={p.id}>
                    <td>{orgName.get(p.org_id) ?? p.org_id.slice(0, 8)}</td>
                    <td>
                      {formatMinor(p.amount_minor, p.currency)}
                      {Number(p.reversed_minor) > 0 ? <span className="muted"> ({formatMinor(p.reversed_minor, p.currency)} reclaimed)</span> : null}
                    </td>
                    <td>
                      {STATUS_LABELS[p.status] ?? p.status}
                      {p.failure_code ? (
                        <>
                          {" "}
                          <code>{p.failure_code}</code>
                        </>
                      ) : null}
                    </td>
                    <td>{p.stripe_transfer_id ? <code>{p.stripe_transfer_id}</code> : ""}</td>
                    <td>{formatAdminDate(p.paid_at ?? p.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
