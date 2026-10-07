import { buildPdf, type PdfLine } from "@/lib/money/pdf";
import { formatMinor, LINE_KIND_LABELS, periodLabel, plainMinor, rateLabel } from "@/lib/money/format";

/**
 * Monthly statements (F-101), as CSV and PDF, built from a closed statement
 * row and its ledger lines. Pure: the route reads the rows through the
 * caller's own client (RLS decides) and hands them here.
 *
 * What a statement shows, per title: units, gross, VAT, payment fees,
 * refunds, net receipts, the rate and the amount; then the membership pool
 * by title; then payouts and adjustments; then the totals and the method in
 * plain words. Never a reader: lines carry no reader fields at all.
 */

export interface StatementRow {
  id: string;
  org_id: string;
  period: string;
  currency: string;
  livemode: boolean;
  opening_minor: number;
  sales_minor: number;
  refunds_minor: number;
  pool_minor: number;
  adjustments_minor: number;
  payouts_minor: number;
  closing_minor: number;
  units: number;
  line_count: number;
  is_placeholder_rate: boolean;
  closed_at: string;
}

export interface StatementLine {
  workbook_id: string | null;
  kind: string;
  units: number;
  gross_minor: number;
  tax_minor: number;
  fee_minor: number;
  net_base_minor: number;
  rate: number | string | null;
  author_minor: number;
  note: string | null;
  occurred_at: string;
}

export interface TitleRef {
  code: string;
  title: string;
}

export interface TitleSummary {
  workbookId: string;
  code: string;
  title: string;
  units: number;
  grossMinor: number;
  taxMinor: number;
  feeMinor: number;
  refundedGrossMinor: number;
  netBaseMinor: number;
  rate: string;
  salesAmountMinor: number;
  poolAmountMinor: number;
  amountMinor: number;
}

export interface StatementModel {
  orgName: string;
  period: string;
  periodLabel: string;
  currency: string;
  livemode: boolean;
  provisional: boolean;
  titles: TitleSummary[];
  other: { kind: string; label: string; amountMinor: number; note: string | null; date: string }[];
  totals: {
    openingMinor: number;
    salesMinor: number;
    refundsMinor: number;
    poolMinor: number;
    adjustmentsMinor: number;
    payoutsMinor: number;
    closingMinor: number;
    units: number;
  };
  method: string[];
}

const SALE_KINDS = new Set(["sale", "refund", "dispute", "dispute_reversal", "fee_correction"]);

export function buildStatementModel(
  st: StatementRow,
  lines: StatementLine[],
  titles: Map<string, TitleRef>,
  orgName: string,
): StatementModel {
  const byTitle = new Map<string, TitleSummary>();
  const rates = new Map<string, Set<string>>();
  const other: StatementModel["other"] = [];

  for (const l of lines) {
    if (!l.workbook_id || !(SALE_KINDS.has(l.kind) || l.kind === "pool")) {
      other.push({
        kind: l.kind,
        label: LINE_KIND_LABELS[l.kind] ?? l.kind,
        amountMinor: Number(l.author_minor),
        note: l.note,
        date: l.occurred_at.slice(0, 10),
      });
      continue;
    }
    const ref = titles.get(l.workbook_id);
    let t = byTitle.get(l.workbook_id);
    if (!t) {
      t = {
        workbookId: l.workbook_id,
        code: ref?.code ?? "",
        title: ref?.title ?? "Withdrawn title",
        units: 0,
        grossMinor: 0,
        taxMinor: 0,
        feeMinor: 0,
        refundedGrossMinor: 0,
        netBaseMinor: 0,
        rate: "",
        salesAmountMinor: 0,
        poolAmountMinor: 0,
        amountMinor: 0,
      };
      byTitle.set(l.workbook_id, t);
    }
    const author = Number(l.author_minor);
    t.amountMinor += author;
    if (l.kind === "pool") {
      t.poolAmountMinor += author;
      continue;
    }
    t.units += Number(l.units);
    t.salesAmountMinor += author;
    if (l.kind === "sale") {
      t.grossMinor += Number(l.gross_minor);
      t.taxMinor += Number(l.tax_minor);
      const set = rates.get(l.workbook_id) ?? new Set<string>();
      set.add(rateLabel(l.rate));
      rates.set(l.workbook_id, set);
    } else if (l.kind === "fee_correction") {
      // the fee confirmed later belongs with the fees
    } else {
      t.refundedGrossMinor += -Number(l.gross_minor);
      t.taxMinor += Number(l.tax_minor);
    }
    t.feeMinor += Number(l.fee_minor);
    t.netBaseMinor += Number(l.net_base_minor);
  }
  for (const [id, set] of rates) {
    const t = byTitle.get(id);
    if (t) t.rate = [...set].filter(Boolean).join(", ");
  }

  const titlesSorted = [...byTitle.values()].sort((a, b) => a.code.localeCompare(b.code));
  const anyPool = titlesSorted.some((t) => t.poolAmountMinor !== 0);
  const provisional = st.is_placeholder_rate;
  const method = [
    "Your share is worked out on net receipts: what the reader paid, less VAT, less the payment fee Stripe charged where that applies.",
    "Each line keeps the rate used on the day, so a later change of rate never alters an earlier line.",
    "A refund or a disputed payment reverses your share of that payment in the month it happens. If that month's statement has already closed, it comes off the next one.",
    ...(anyPool
      ? ["Membership pool: each member's own net payment for the month, times the pool share, is split between the workbooks they completed steps in. Steps count up to a cap per workbook each month."]
      : []),
    "Amounts are rounded down to the smallest unit of the currency. A month closes once the refund window after it has passed.",
    ...(provisional ? ["PROVISIONAL: the rates on this statement are placeholders until the licence figures are agreed. They are not final."] : []),
    ...(st.livemode ? [] : ["TEST MODE: this statement is built from test payments. No real money moved."]),
  ];

  return {
    orgName,
    period: st.period,
    periodLabel: periodLabel(st.period),
    currency: st.currency,
    livemode: st.livemode,
    provisional,
    titles: titlesSorted,
    other: other.sort((a, b) => a.date.localeCompare(b.date)),
    totals: {
      openingMinor: Number(st.opening_minor),
      salesMinor: Number(st.sales_minor),
      refundsMinor: Number(st.refunds_minor),
      poolMinor: Number(st.pool_minor),
      adjustmentsMinor: Number(st.adjustments_minor),
      payoutsMinor: Number(st.payouts_minor),
      closingMinor: Number(st.closing_minor),
      units: Number(st.units),
    },
    method,
  };
}

/** Quote a CSV cell, and defuse cells a spreadsheet would run as a formula. */
export function csvCell(v: string | number): string {
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function statementCsv(m: StatementModel): string {
  const cur = m.currency;
  const rows: (string | number)[][] = [
    ["section", "code", "title", "item", "units", "gross", "vat", "fees", "refunded", "net_receipts", "rate", "amount", "currency"],
  ];
  for (const t of m.titles) {
    rows.push([
      "title",
      t.code,
      t.title,
      "sales",
      t.units,
      plainMinor(t.grossMinor),
      plainMinor(t.taxMinor),
      plainMinor(t.feeMinor),
      plainMinor(t.refundedGrossMinor),
      plainMinor(t.netBaseMinor),
      t.rate,
      plainMinor(t.salesAmountMinor),
      cur,
    ]);
    if (t.poolAmountMinor !== 0) {
      rows.push(["title", t.code, t.title, "membership_pool", "", "", "", "", "", "", "", plainMinor(t.poolAmountMinor), cur]);
    }
  }
  for (const o of m.other) {
    rows.push(["other", "", o.note ?? "", o.kind, "", "", "", "", "", "", "", plainMinor(o.amountMinor), cur]);
  }
  const t = m.totals;
  const total = (item: string, minor: number, units: number | "" = "") => rows.push(["total", "", "", item, units, "", "", "", "", "", "", plainMinor(minor), cur]);
  total("opening_balance", t.openingMinor);
  total("sales", t.salesMinor, t.units);
  total("refunds_and_disputes", t.refundsMinor);
  total("membership_pool", t.poolMinor);
  total("adjustments", t.adjustmentsMinor);
  total("payouts", t.payoutsMinor);
  total("closing_balance", t.closingMinor);
  rows.push(["meta", "", m.orgName, "period", "", "", "", "", "", "", "", m.period, cur]);
  rows.push(["meta", "", "", "mode", "", "", "", "", "", "", "", m.livemode ? "live" : "test", cur]);
  rows.push(["meta", "", "", "provisional", "", "", "", "", "", "", "", m.provisional ? "yes" : "no", cur]);
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}
function lpad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : " ".repeat(n - s.length) + s;
}

/** The statement as PDF lines: headings in Helvetica, the tables in Courier. */
export function statementPdfLines(m: StatementModel): PdfLine[] {
  const cur = m.currency;
  const money = (n: number) => plainMinor(n);
  const lines: PdfLine[] = [
    { text: "Akana royalty statement", font: "bold", size: 16 },
    { text: `${m.orgName}`, font: "regular", size: 12, gap: 4 },
    { text: `${m.periodLabel}. Amounts in ${cur}.`, size: 10 },
  ];
  if (m.provisional) lines.push({ text: "PROVISIONAL: placeholder rates, not final.", font: "bold", size: 10, gap: 4 });
  if (!m.livemode) lines.push({ text: "TEST MODE: built from test payments. No real money moved.", font: "bold", size: 10 });

  lines.push({ text: "By title", font: "bold", size: 12, gap: 12 });
  const head = `${pad("Code", 9)}${lpad("Units", 6)}${lpad("Gross", 10)}${lpad("VAT", 9)}${lpad("Fees", 8)}${lpad("Refunded", 10)}${lpad("Net", 10)}${lpad("Rate", 7)}${lpad("Amount", 10)}`;
  lines.push({ text: head, font: "mono", size: 8, gap: 2 });
  if (m.titles.length === 0) lines.push({ text: "No sales this month.", size: 9 });
  for (const t of m.titles) {
    lines.push({ text: `${t.code}  ${t.title}`, font: "regular", size: 9, gap: 3 });
    lines.push({
      text: `${pad("", 9)}${lpad(String(t.units), 6)}${lpad(money(t.grossMinor), 10)}${lpad(money(t.taxMinor), 9)}${lpad(money(t.feeMinor), 8)}${lpad(money(t.refundedGrossMinor), 10)}${lpad(money(t.netBaseMinor), 10)}${lpad(t.rate, 7)}${lpad(money(t.salesAmountMinor), 10)}`,
      font: "mono",
      size: 8,
    });
    if (t.poolAmountMinor !== 0) {
      lines.push({ text: `${pad("", 9)}${pad("Membership pool", 60)}${lpad(money(t.poolAmountMinor), 10)}`, font: "mono", size: 8 });
    }
  }

  if (m.other.length) {
    lines.push({ text: "Payouts and adjustments", font: "bold", size: 12, gap: 12 });
    for (const o of m.other) {
      lines.push({ text: `${pad(o.date, 12)}${pad(o.label + (o.note ? `: ${o.note}` : ""), 57)}${lpad(money(o.amountMinor), 10)}`, font: "mono", size: 8 });
    }
  }

  const t = m.totals;
  lines.push({ text: "Summary", font: "bold", size: 12, gap: 12 });
  const sum = (label: string, n: number) => lines.push({ text: `${pad(label, 40)}${lpad(formatMinor(n, cur), 16)}`, font: "mono", size: 9 });
  sum("Brought forward", t.openingMinor);
  sum(`Sales (${t.units} unit${t.units === 1 ? "" : "s"})`, t.salesMinor);
  sum("Refunds and disputes", t.refundsMinor);
  sum("Membership pool", t.poolMinor);
  sum("Adjustments and fees confirmed", t.adjustmentsMinor);
  sum("Paid to you", t.payoutsMinor);
  sum("Carried forward", t.closingMinor);

  lines.push({ text: "How this is worked out", font: "bold", size: 12, gap: 12 });
  for (const para of m.method) {
    for (const w of wrap(para, 95)) lines.push({ text: w, size: 9 });
    lines.push({ text: "", size: 4 });
  }
  return lines;
}

/** Break a paragraph into lines of at most n characters, on spaces. */
export function wrap(text: string, n: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const word of text.split(/\s+/)) {
    if (!word) continue;
    if (cur && cur.length + 1 + word.length > n) {
      out.push(cur);
      cur = word;
    } else {
      cur = cur ? `${cur} ${word}` : word;
    }
  }
  if (cur) out.push(cur);
  return out;
}

export function statementPdf(m: StatementModel): Uint8Array {
  return buildPdf(statementPdfLines(m), {
    title: `Akana statement ${m.period} ${m.currency}`,
    footer: `Akana royalty statement, ${m.orgName}, ${m.periodLabel}, ${m.currency}${m.livemode ? "" : ", test mode"}.`,
  });
}

/** A safe file name: akana-statement-<org code or slug>-<period>-<currency>.<ext> */
export function statementFileName(orgRef: string, m: Pick<StatementModel, "period" | "currency" | "livemode">, ext: "pdf" | "csv"): string {
  const ref = orgRef.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "organisation";
  return `akana-statement-${ref}-${m.period}-${m.currency.toLowerCase()}${m.livemode ? "" : "-test"}.${ext}`;
}
