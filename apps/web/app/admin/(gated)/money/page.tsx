import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatAdminDate } from "@/lib/admin/leads";
import { CONFIG_CURRENCIES, pctValue } from "@/lib/money/config-form";
import { currentConfig, type RoyaltyConfig } from "@/lib/money/db";
import { formatMinor, plainMinor, rateLabel } from "@/lib/money/format";
import { moneyAbilities } from "@/lib/money/permissions";
import { isTestKey } from "@/lib/money/reconcile";
import { weekdayName } from "@/lib/money/studio-payments";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";
import { AdminBack } from "../_components/Bits";
import { closeDueMonths, resolveReconciliationItem, saveRoyaltyConfig } from "./actions";
import { ModeBanner, MoneyNav, MoneyNotice } from "./MoneyBits";

export const metadata: Metadata = { title: "Money", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

interface BalanceRow {
  org_id: string;
  currency: string;
  livemode: boolean;
  balance_minor: number;
  payable_minor: number;
  pending_payout_minor: number;
  last_closed_period: string | null;
  has_placeholder_rate: boolean;
}

interface RunRow {
  id: string;
  ran_at: string;
  stripe_txns: number;
  matched: number;
  corrected: number;
  issues: number;
}

interface ItemRow {
  id: string;
  kind: string;
  stripe_ref: string | null;
  balance_txn_id: string | null;
  currency: string | null;
  expected_minor: number | null;
  actual_minor: number | null;
  note: string | null;
}

const ITEM_LABELS: Record<string, string> = {
  missing_in_ledger: "In Stripe, not in the ledger",
  missing_in_stripe: "In the ledger, not in Stripe",
  amount_mismatch: "Amounts disagree",
  fee_mismatch: "Fee could not be recorded",
  currency_mismatch: "Currency could not be converted",
  unmatched_type: "Unknown Stripe type",
};

/**
 * Money overview (F-100, F-103): the royalty figures in force, balances by
 * organisation, and the daily reconciliation with anything left to look
 * at. Platform owners and finance only. Nothing here names a reader.
 */
export default async function MoneyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await getStaffSession("/admin/money");
  const can = moneyAbilities(staff.roles);
  if (!can.read) notFound();
  const sp = await searchParams;
  const supabase = await createUserClient();
  const livemode = !isTestKey(process.env.STRIPE_SECRET_KEY);

  let config: RoyaltyConfig | null = null;
  try {
    config = await currentConfig(supabase);
  } catch (err) {
    console.error("money_config_read_failed", err instanceof Error ? err.message : "");
  }

  const [balancesRes, runsRes, itemsRes] = await Promise.all([
    supabase
      .from("royalty_balances")
      .select("org_id, currency, livemode, balance_minor, payable_minor, pending_payout_minor, last_closed_period, has_placeholder_rate")
      .eq("livemode", livemode)
      .order("balance_minor", { ascending: false })
      .limit(200),
    supabase.from("reconciliation_runs").select("id, ran_at, stripe_txns, matched, corrected, issues").eq("livemode", livemode).order("ran_at", { ascending: false }).limit(7),
    supabase
      .from("reconciliation_items")
      .select("id, kind, stripe_ref, balance_txn_id, currency, expected_minor, actual_minor, note")
      .is("resolved_at", null)
      .limit(100),
  ]);
  for (const [tag, r] of [["balances", balancesRes], ["runs", runsRes], ["items", itemsRes]] as const) {
    if (r.error) console.error(`money_${tag}_read_failed`, r.error.code ?? "");
  }
  const balances = (balancesRes.data ?? []) as BalanceRow[];
  const runs = (runsRes.data ?? []) as RunRow[];
  const items = (itemsRes.data ?? []) as ItemRow[];

  const orgIds = [...new Set(balances.map((b) => b.org_id))];
  const names = new Map<string, string>();
  if (orgIds.length) {
    const { data } = await supabase.from("organisations").select("id, display_name").in("id", orgIds);
    for (const o of (data ?? []) as { id: string; display_name: string }[]) names.set(o.id, o.display_name);
  }

  return (
    <div className="admin-page money-page">
      <AdminBack />
      <h1>Money</h1>
      <MoneyNav current="/admin/money" />
      <p className="muted">
        The royalty ledger on net receipts. Lines are never edited: corrections are new lines. A month closes for an organisation once the refund
        window after it has passed.
      </p>
      <MoneyNotice code={sp.notice} />
      <ModeBanner livemode={livemode} placeholder={config?.is_placeholder ?? true} />

      <section aria-labelledby="money-balances-h">
        <h2 id="money-balances-h">Balances</h2>
        {balances.length === 0 ? (
          <div className="card admin-empty">
            <p>No ledger lines yet. A paid sale writes the first one.</p>
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <caption className="admin-vh">Balances by organisation and currency</caption>
              <thead>
                <tr>
                  <th scope="col">Organisation</th>
                  <th scope="col">Balance</th>
                  <th scope="col">Payable now</th>
                  <th scope="col">Waiting to pay</th>
                  <th scope="col">Last closed month</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((b) => (
                  <tr key={`${b.org_id}-${b.currency}`}>
                    <td>
                      {names.get(b.org_id) ?? <code>{b.org_id.slice(0, 8)}</code>}
                      {b.has_placeholder_rate ? <span className="badge money-provisional">Provisional</span> : null}
                    </td>
                    <td>{formatMinor(b.balance_minor, b.currency)}</td>
                    <td>{formatMinor(b.payable_minor, b.currency)}</td>
                    <td>{formatMinor(b.pending_payout_minor, b.currency)}</td>
                    <td>{b.last_closed_period ?? <span className="muted">None yet</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {can.runPayouts ? (
          <form action={closeDueMonths} className="admin-actions">
            <input type="hidden" name="back" value="money" />
            <button type="submit" className="btn secondary">
              Close due months now
            </button>
            <span className="muted">The daily job does this too.</span>
          </form>
        ) : null}
      </section>

      <section aria-labelledby="money-recon-h">
        <h2 id="money-recon-h">Daily reconciliation with Stripe</h2>
        {runs.length === 0 ? (
          <p className="muted">No run yet. The daily job at /api/money/daily writes one each morning.</p>
        ) : (
          <ul className="review-list">
            {runs.map((r) => (
              <li key={r.id}>
                {formatAdminDate(r.ran_at)}: {r.stripe_txns} Stripe payments and refunds, {r.matched} matched, {r.corrected} fee
                {r.corrected === 1 ? "" : "s"} recorded,{" "}
                {r.issues === 0 ? "nothing to look at." : <strong>{r.issues} to look at.</strong>}
              </li>
            ))}
          </ul>
        )}
        {items.length ? (
          <>
            <h3>Open items</h3>
            <ul className="review-list">
              {items.map((i) => (
                <li key={i.id} className="card money-item">
                  <p>
                    <strong>{ITEM_LABELS[i.kind] ?? i.kind}</strong>
                    {i.stripe_ref ? (
                      <>
                        {" "}
                        <code>{i.stripe_ref}</code>
                      </>
                    ) : null}
                    {i.balance_txn_id ? (
                      <>
                        {" "}
                        <code>{i.balance_txn_id}</code>
                      </>
                    ) : null}
                  </p>
                  <p className="muted">
                    {i.note}
                    {i.expected_minor !== null ? ` Ledger ${plainMinor(i.expected_minor)}.` : ""}
                    {i.actual_minor !== null ? ` Stripe ${plainMinor(i.actual_minor)}.` : ""}
                  </p>
                  <form action={resolveReconciliationItem} className="admin-form">
                    <input type="hidden" name="item" value={i.id} />
                    <label htmlFor={`res-${i.id}`}>What you found</label>
                    <input id={`res-${i.id}`} name="resolution" minLength={3} maxLength={500} required />
                    <button type="submit" className="btn secondary">
                      Mark resolved
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      <section aria-labelledby="money-config-h">
        <h2 id="money-config-h">Royalty figures in force</h2>
        {config ? (
          <>
            <dl className="admin-dl">
              <div>
                <dt>Status</dt>
                <dd>{config.is_placeholder ? "PLACEHOLDER: not a decision (D1 to D5)" : `Set ${formatAdminDate(config.effective_from)}`}</dd>
              </div>
              <div>
                <dt>Single sale, author share</dt>
                <dd>
                  {rateLabel(config.sale_rate_author)} of net receipts on marketplace sales; {rateLabel(config.sale_rate_author_link)} on sales through the
                  author&apos;s own link (0039: the channel is recorded per sale, author links are not issued yet)
                </dd>
              </div>
              <div>
                <dt>Membership pool share</dt>
                <dd>
                  {rateLabel(config.pool_share_author)}, split by each member&apos;s completed steps, capped at {config.pool_step_cap} per workbook a month,
                  with at least {config.pool_activity_floor} step{config.pool_activity_floor === 1 ? "" : "s"} to count
                </dd>
              </div>
              <div>
                <dt>Stripe fees</dt>
                <dd>{config.fee_treatment === "deduct" ? "Taken off before the share" : "Carried by Akana"}</dd>
              </div>
              <div>
                <dt>Refund window</dt>
                <dd>{config.refund_window_days} days after the month ends</dd>
              </div>
              <div>
                <dt>First payout</dt>
                <dd>Held until the first sale is {config.first_payout_hold_days} days old</dd>
              </div>
              <div>
                <dt>Minimum payout</dt>
                <dd>{Object.entries(config.min_payout_minor).map(([c, v]) => formatMinor(v, c)).join(", ") || "None set"}</dd>
              </div>
              <div>
                <dt>Approval above</dt>
                <dd>{Object.entries(config.approval_above_minor).map(([c, v]) => formatMinor(v, c)).join(", ") || "None set"}</dd>
              </div>
              <div>
                <dt>Payout calendar</dt>
                <dd>
                  {config.payout_cadence === "weekly"
                    ? `Weekly on ${weekdayName(config.payout_weekday)}s (published in the Studio). The run itself still acts on day ${config.payout_day} of each month, London time, until the weekly run is switched on.`
                    : `Monthly on day ${config.payout_day}, London time`}
                </dd>
              </div>
            </dl>
            {config.note ? <p className="muted">{config.note}</p> : null}
          </>
        ) : (
          <p className="admin-notice admin-notice-error">The royalty figures could not be read.</p>
        )}

        {can.setConfig && config ? (
          <details className="card money-config">
            <summary>Set new figures</summary>
            <p className="muted">
              New figures apply to lines written from now on. Earlier lines keep the rate they used. Saving marks the figures as decided, not
              placeholders.
            </p>
            <form action={saveRoyaltyConfig} className="admin-form">
              <label htmlFor="cfg-sale">Single sale, author share (%)</label>
              <input id="cfg-sale" name="sale_rate" inputMode="decimal" defaultValue={pctValue(config.sale_rate_author)} required />
              <label htmlFor="cfg-sale-link">Author&apos;s own link, author share (%)</label>
              <input id="cfg-sale-link" name="sale_rate_link" inputMode="decimal" defaultValue={pctValue(config.sale_rate_author_link)} required />
              <label htmlFor="cfg-pool">Membership pool share (%)</label>
              <input id="cfg-pool" name="pool_share" inputMode="decimal" defaultValue={pctValue(config.pool_share_author)} required />
              <label htmlFor="cfg-cap">Steps counted per workbook a month</label>
              <input id="cfg-cap" name="step_cap" inputMode="numeric" defaultValue={String(config.pool_step_cap)} required />
              <label htmlFor="cfg-floor">Steps a member needs in a month to count</label>
              <input id="cfg-floor" name="activity_floor" inputMode="numeric" defaultValue={String(config.pool_activity_floor)} required />
              <label htmlFor="cfg-fee">Stripe fees</label>
              <select id="cfg-fee" name="fee_treatment" defaultValue={config.fee_treatment}>
                <option value="deduct">Taken off before the share</option>
                <option value="akana_carries">Carried by Akana</option>
              </select>
              <label htmlFor="cfg-window">Refund window (days)</label>
              <input id="cfg-window" name="refund_window_days" inputMode="numeric" defaultValue={String(config.refund_window_days)} required />
              <label htmlFor="cfg-hold">First payout hold (days)</label>
              <input id="cfg-hold" name="first_payout_hold_days" inputMode="numeric" defaultValue={String(config.first_payout_hold_days)} required />
              <label htmlFor="cfg-cadence">Payout calendar</label>
              <select id="cfg-cadence" name="payout_cadence" defaultValue={config.payout_cadence}>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
              <label htmlFor="cfg-weekday">Weekly payout day</label>
              <select id="cfg-weekday" name="payout_weekday" defaultValue={String(config.payout_weekday)}>
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <option key={d} value={String(d)}>
                    {weekdayName(d)}
                  </option>
                ))}
              </select>
              <label htmlFor="cfg-day">Monthly payout day (1 to 28), the day the run acts on for now</label>
              <input id="cfg-day" name="payout_day" inputMode="numeric" defaultValue={String(config.payout_day)} required />
              {CONFIG_CURRENCIES.map((c) => (
                <div key={c} className="money-pair">
                  <label htmlFor={`cfg-min-${c}`}>Minimum payout, {c}</label>
                  <input id={`cfg-min-${c}`} name={`min_${c}`} inputMode="decimal" defaultValue={config.min_payout_minor[c] ? plainMinor(config.min_payout_minor[c]) : ""} />
                  <label htmlFor={`cfg-approve-${c}`}>Approve by hand above, {c}</label>
                  <input
                    id={`cfg-approve-${c}`}
                    name={`approve_${c}`}
                    inputMode="decimal"
                    defaultValue={config.approval_above_minor[c] ? plainMinor(config.approval_above_minor[c]) : ""}
                  />
                </div>
              ))}
              <label htmlFor="cfg-note">Where this was decided</label>
              <input id="cfg-note" name="note" minLength={3} maxLength={500} required />
              <button type="submit" className="btn">
                Save figures
              </button>
            </form>
          </details>
        ) : null}
      </section>
    </div>
  );
}
