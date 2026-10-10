import type { Metadata } from "next";
import Link from "next/link";
import { ConnectHoldBanner } from "@/components/studio/ConnectHoldBanner";
import { OrgSwitcher } from "@/components/studio/StudioBits";
import { money, monthLabel } from "@/lib/dashboards";
import {
  CHANNEL_LABELS,
  dayLabel,
  floorFor,
  nextMonthlyPayout,
  payoutPeriods,
  periodsLabel,
  saleBreakdown,
  shareLabel,
  weekdayName,
  weeklyCalendar,
  type PayoutRow,
  type PayoutSchedule,
  type StatementPeriod,
} from "@/lib/money/studio-payments";
import { parseOrgRole } from "@/lib/studio";
import { requireStudio } from "@/lib/studio-server";
import { createUserClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Payments", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

interface SaleLineRow {
  id: string;
  period: string;
  currency: string;
  livemode: boolean;
  gross_minor: number | string;
  tax_minor: number | string;
  fee_minor: number | string;
  rate: number | string | null;
  author_minor: number | string;
  akana_minor: number | string;
  is_placeholder_rate: boolean;
  channel?: string | null;
  occurred_at: string;
  workbooks: { title: string; code: string | null } | null;
}

const SALE_COLUMNS = "id, period, currency, livemode, gross_minor, tax_minor, fee_minor, rate, author_minor, akana_minor, is_placeholder_rate, occurred_at, workbooks(title, code)";

function dateLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" }).format(new Date(iso));
}

/**
 * Payments (build list 14.27, 14.28, 8.6, 13.12). The payout calendar from
 * royalty_config, every payout with its status, amount, period and Stripe
 * transfer reference, and one breakdown line per sale: reader price, VAT,
 * card processing, Akana's share and the author's share, with the rate by
 * channel. Everything comes through the member's own client under 0021's
 * RLS. Exact amounts, never a reader's identity. The demo organisation
 * reads 0029's demo tables, labelled Demo.
 */
export default async function StudioPaymentsPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const ctx = await requireStudio("/studio/payments", sp.org);
  const supabase = await createUserClient();
  const demo = ctx.org.isDemo;
  const role = parseOrgRole(ctx.org.role);
  const seesPayouts = role === "owner" || role === "finance";

  const [scheduleRes, payoutsRes, statementsRes, salesRes] = await Promise.all([
    supabase.rpc("payout_schedule"),
    demo
      ? supabase.from("demo_royalty_lines").select("id, currency, livemode, author_minor, period, occurred_at").eq("org_id", ctx.org.id).eq("kind", "payout").order("occurred_at", { ascending: false }).limit(100)
      : supabase
          .from("payouts")
          .select("id, currency, livemode, amount_minor, status, stripe_transfer_id, created_at, paid_at")
          .eq("org_id", ctx.org.id)
          .order("created_at", { ascending: false })
          .limit(100),
    supabase.from(demo ? "demo_statements" : "statements").select("period, currency, livemode, closed_at").eq("org_id", ctx.org.id).limit(120),
    supabase
      .from(demo ? "demo_royalty_lines" : "royalty_lines")
      .select(demo ? SALE_COLUMNS : `${SALE_COLUMNS}, channel`)
      .eq("org_id", ctx.org.id)
      .eq("kind", "sale")
      .order("occurred_at", { ascending: false })
      .limit(200),
  ]);
  if (scheduleRes.error) console.error("studio_schedule_failed", scheduleRes.error.code ?? "");
  if (payoutsRes.error) console.error("studio_payouts_failed", payoutsRes.error.code ?? "");
  if (statementsRes.error) console.error("studio_statement_periods_failed", statementsRes.error.code ?? "");
  if (salesRes.error) console.error("studio_sales_failed", salesRes.error.code ?? "");

  const schedule = ((scheduleRes.data ?? []) as PayoutSchedule[])[0] ?? null;
  const statements = (statementsRes.data ?? []) as StatementPeriod[];
  const payoutRows: PayoutRow[] = demo
    ? ((payoutsRes.data ?? []) as { id: string; currency: string; livemode: boolean; author_minor: number | string; occurred_at: string }[]).map((l) => ({
        id: l.id,
        currency: l.currency,
        livemode: l.livemode,
        amount_minor: Math.abs(Number(l.author_minor)),
        status: "paid" as const,
        stripe_transfer_id: null,
        created_at: l.occurred_at,
        paid_at: l.occurred_at,
      }))
    : ((payoutsRes.data ?? []) as PayoutRow[]);
  const payouts = payoutPeriods(payoutRows, statements);
  const sales = (salesRes.data ?? []) as unknown as SaleLineRow[];
  const provisional = schedule?.is_placeholder ?? true;
  const now = new Date();
  const weeks = schedule ? weeklyCalendar(now, schedule.payout_weekday, 4) : [];
  const currencies = Array.from(new Set([...sales.map((s) => s.currency), ...payoutRows.map((p) => p.currency), "GBP"]));

  return (
    <div className="admin-page studio-page dash-page">
      <OrgSwitcher ctx={ctx} path="/studio/payments" />
      <h1>Payments</h1>
      <ConnectHoldBanner ctx={ctx} />

      {demo ? (
        <p className="studio-draft" role="note">
          <strong>Demo.</strong> These are invented test-mode figures for the Quillmoor demo. No reader paid and no money moved.
        </p>
      ) : null}

      <section className="card dash-method" aria-labelledby="calendar-h">
        <h2 id="calendar-h">When you are paid</h2>
        {!schedule ? (
          <p className="muted">The payout schedule could not be read.</p>
        ) : (
          <>
            {schedule.payout_cadence === "weekly" ? (
              <>
                <p>
                  Payouts run every {weekdayName(schedule.payout_weekday)}. Sales in a Monday to Sunday week are paid on the {weekdayName(schedule.payout_weekday)} of the
                  week after, London time.
                </p>
                <ul className="muted small">
                  {weeks.map((w) => (
                    <li key={w.weekStart.toISOString()}>
                      {w.sentence}
                      {w.current ? " (this week)" : ""}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p>
                Payouts run once a month on day {schedule.payout_day}, London time. The next one is {dayLabel(nextMonthlyPayout(now, schedule.payout_day))}.
              </p>
            )}
            <p>
              {currencies
                .map((c) => {
                  const f = floorFor(schedule, c);
                  return f === null ? null : `Below ${money(f, c)} in ${c} the balance carries forward to the next payout.`;
                })
                .filter(Boolean)
                .join(" ")}{" "}
              A month closes {schedule.refund_window_days} days after it ends, so late refunds can land before it is paid.
            </p>
            <p className="muted small">
              {provisional ? "This schedule is a placeholder until Akana sets the final figures. " : ""}
              {schedule.payout_cadence === "weekly"
                ? `For now the payout run itself goes out monthly on day ${schedule.payout_day}; the weekly run follows once it is switched on, and this page will say so.`
                : ""}
            </p>
          </>
        )}
      </section>

      <section className="card dash-method" aria-labelledby="shares-h">
        <h2 id="shares-h">Your share</h2>
        {!schedule ? (
          <p className="muted">The share rates could not be read.</p>
        ) : (
          <>
            <p>
              Sales through your own link: <strong>{shareLabel(schedule.sale_rate_author_link, provisional)}</strong> of the net receipt. Marketplace sales:{" "}
              <strong>{shareLabel(schedule.sale_rate_author, provisional)}</strong> of the net receipt.
            </p>
            <p className="muted small">
              The net receipt is what the reader paid, less VAT{schedule.fee_treatment === "deduct" ? " and the card processing fee" : ""}.
              {provisional ? " These rates are placeholders until Akana sets them (D1 to D5). Nothing is paid out at placeholder rates in live mode." : ""} Author
              links are not issued yet, so every sale so far is a marketplace sale.
            </p>
          </>
        )}
      </section>

      <h2>Payouts</h2>
      {!demo && !seesPayouts ? (
        <p className="muted">Payout records are shown to the organisation&apos;s owner and finance contacts.</p>
      ) : payoutsRes.error ? (
        <p className="admin-notice admin-notice-error">Payouts could not be read.</p>
      ) : payouts.length === 0 ? (
        <p className="muted">No payouts yet. The first one goes out once a closed month is above the floor and payouts are set up.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="admin-vh">Payouts</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Status</th>
                <th scope="col" className="dash-num">
                  Amount
                </th>
                <th scope="col">Period covered</th>
                <th scope="col">Stripe transfer</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p.id}>
                  <th scope="row">
                    {dateLabel(p.paid_at ?? p.created_at)} {demo ? <span className="badge demo">Demo</span> : p.livemode ? null : <span className="badge demo">Test</span>}
                  </th>
                  <td>{p.statusLabel}</td>
                  <td className="dash-num">{money(p.amount_minor, p.currency)}</td>
                  <td>{periodsLabel(p.periods, monthLabel) || (p.statusLabel === "Pending" ? "Months closed so far" : "")}</td>
                  <td>{p.stripe_transfer_id ? <code>{p.stripe_transfer_id}</code> : <span className="muted">None yet</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">
        Payouts go to the account on your <Link href="/payouts">payouts</Link> page. Statements are on <Link href="/studio/earnings">Earnings</Link>.
      </p>

      <h2>Each sale</h2>
      {salesRes.error ? (
        <p className="admin-notice admin-notice-error">Sales could not be read.</p>
      ) : sales.length === 0 ? (
        <p className="muted">No sales recorded yet.</p>
      ) : (
        <>
          <p className="muted small">
            One line per sale, newest first, up to 200. A card fee learned after the sale shows as a correction on your statement, not here.
          </p>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <caption className="admin-vh">Sales, one line each</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Workbook</th>
                  <th scope="col">Channel</th>
                  <th scope="col" className="dash-num">
                    Reader paid
                  </th>
                  <th scope="col" className="dash-num">
                    VAT
                  </th>
                  <th scope="col" className="dash-num">
                    Card processing
                  </th>
                  <th scope="col" className="dash-num">
                    Akana share
                  </th>
                  <th scope="col" className="dash-num">
                    Your share
                  </th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => {
                  const b = saleBreakdown(s);
                  return (
                    <tr key={s.id}>
                      <th scope="row">
                        {dateLabel(s.occurred_at)} {demo ? <span className="badge demo">Demo</span> : s.livemode ? null : <span className="badge demo">Test</span>}
                      </th>
                      <td>
                        {s.workbooks?.title ?? "Workbook"} {s.workbooks?.code ? <code>{s.workbooks.code}</code> : null}
                      </td>
                      <td>{CHANNEL_LABELS[b.channel]}</td>
                      <td className="dash-num">{money(b.price, s.currency)}</td>
                      <td className="dash-num">{b.vat > 0 ? money(b.vat, s.currency) : <span className="muted">None recorded</span>}</td>
                      <td className="dash-num">{b.fee > 0 ? money(b.fee, s.currency) : <span className="muted">Not yet known</span>}</td>
                      <td className="dash-num">{money(b.akana, s.currency)}</td>
                      <td className="dash-num">
                        <strong>{money(b.author, s.currency)}</strong>
                        {b.rate !== null ? <span className="muted small"> {shareLabel(b.rate, s.is_placeholder_rate)}</span> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
