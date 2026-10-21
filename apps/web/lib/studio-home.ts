import { authorStatus } from "@/lib/author-release";
import { countText, money } from "@/lib/dashboards";

/**
 * The Studio home summary (build list 8.1 and 13.13). Pure formatting of what
 * the database already returns: programmes with readers started and finished
 * (public.studio_home_summary, 0057, which hides anything under 10), and the
 * royalty balances the earnings page reads. Nothing here is a new figure and
 * no reader is named. A count under 10 reads "Fewer than 10", zero included.
 */

export interface SummaryRow {
  workbook_id: string;
  code: string;
  title: string;
  status: string;
  is_demo: boolean;
  started: number | string | null;
  finished: number | string | null;
}

export interface ProgrammeLine {
  id: string;
  code: string;
  title: string;
  statusLabel: string;
  live: boolean;
  demo: boolean;
  started: string;
  finished: string;
}

const num = (v: number | string | null): number | null => (v === null || v === undefined ? null : Number(v));

/** Live programmes first, then by title. The database sends the most recently changed first. */
export function programmeLines(rows: readonly SummaryRow[]): ProgrammeLine[] {
  const lines = rows.map((r) => {
    const started = num(r.started);
    const finished = num(r.finished);
    return {
      id: r.workbook_id,
      code: r.code,
      title: r.title,
      statusLabel: authorStatus(r.status).label,
      live: r.status === "live",
      demo: r.is_demo,
      started: countText(started, started === null),
      finished: countText(finished, finished === null),
    };
  });
  return lines.sort((a, b) => Number(b.live) - Number(a.live) || a.title.localeCompare(b.title));
}

/** How many programmes are in each state, for the one-line summary. */
export function programmeCounts(rows: readonly Pick<SummaryRow, "status">[]): { total: number; live: number; inReview: number; draft: number } {
  return {
    total: rows.length,
    live: rows.filter((r) => r.status === "live").length,
    inReview: rows.filter((r) => r.status === "in_review" || r.status === "approved").length,
    draft: rows.filter((r) => r.status === "draft").length,
  };
}

export interface BalanceRow {
  currency: string;
  livemode: boolean;
  balance_minor: number | string;
  payable_minor: number | string;
  pending_payout_minor: number | string;
  has_placeholder_rate?: boolean;
}

export interface EarningsLine {
  key: string;
  label: string;
  balance: string;
  payable: string;
  pending: string;
  provisional: boolean;
}

/** One line per currency and mode, live before test, with exact amounts. */
export function earningsLines(rows: readonly BalanceRow[]): EarningsLine[] {
  return [...rows]
    .sort((a, b) => Number(b.livemode) - Number(a.livemode) || a.currency.localeCompare(b.currency))
    .map((r) => ({
      key: `${r.currency}-${r.livemode ? "live" : "test"}`,
      label: `${r.currency}${r.livemode ? "" : " (test mode)"}`,
      balance: money(r.balance_minor, r.currency),
      payable: money(r.payable_minor, r.currency),
      pending: money(r.pending_payout_minor, r.currency),
      provisional: Boolean(r.has_placeholder_rate),
    }));
}
