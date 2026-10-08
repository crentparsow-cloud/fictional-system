import { describe, expect, it } from "vitest";
import { formatMinor, parseMajorToMinor, periodLabel, plainMinor, rateLabel } from "@/lib/money/format";
import { disputeInfo, feeFromBalanceTxn } from "@/lib/money/ledger";
import { buildPdf, paginate, pdfStringBytes } from "@/lib/money/pdf";
import { executePayouts, isPayoutDay, runPayouts, stripeErrorCode, type PayoutStore, type PendingPayout, type TransferApi } from "@/lib/money/payout-run";
import { moneyAbilities } from "@/lib/money/permissions";
import { isTestKey, reconcile, reconciliationWindow, type ReceiptRow, type StripeTxn } from "@/lib/money/reconcile";
import { classifyPurchaseQuery, parseRefundForm, reclaimAmount, refundableMinor, stripeRefundReason } from "@/lib/money/refund";
import { buildStatementModel, csvCell, statementCsv, statementFileName, statementPdf, statementPdfLines, wrap, type StatementLine, type StatementRow } from "@/lib/money/statement";

describe("format", () => {
  it("formats minor units with the currency", () => {
    expect(formatMinor(12345, "GBP")).toBe("£123.45");
    expect(formatMinor(-500, "gbp")).toBe("-£5.00");
    expect(formatMinor(5, "USD")).toBe("$0.05");
    expect(formatMinor(123456789, "GBP")).toBe("£1,234,567.89");
    expect(formatMinor(100, "SEK")).toBe("1.00 SEK");
    expect(plainMinor(-1234)).toBe("-12.34");
  });
  it("parses pounds to pence and refuses junk", () => {
    expect(parseMajorToMinor("12.5")).toBe(1250);
    expect(parseMajorToMinor("£1,200")).toBe(120000);
    expect(parseMajorToMinor("0")).toBeNull();
    expect(parseMajorToMinor("1.234")).toBeNull();
    expect(parseMajorToMinor("-3")).toBeNull();
    expect(parseMajorToMinor(12)).toBeNull();
  });
  it("labels periods and rates", () => {
    expect(periodLabel("2026-08")).toBe("August 2026");
    expect(periodLabel("nope")).toBe("nope");
    expect(rateLabel("0.5000")).toBe("50%");
    expect(rateLabel(0.125)).toBe("12.5%");
    expect(rateLabel(null)).toBe("");
  });
});

describe("money permissions", () => {
  it("opens money to owners and finance only; config to owners", () => {
    expect(moneyAbilities(["finance"])).toMatchObject({ read: true, refund: true, setConfig: false });
    expect(moneyAbilities(["owner"])).toMatchObject({ read: true, setConfig: true, adjust: true });
    expect(moneyAbilities(["support", "editor"]).read).toBe(false);
    expect(moneyAbilities(["made_up"]).read).toBe(false);
  });
});

describe("refund helpers", () => {
  const form = (o: Record<string, string>) => (k: string) => o[k];
  it("parses a full and a partial refund", () => {
    const id = "6f1c2a9e-1111-4222-8333-444455556666";
    expect(parseRefundForm(form({ target: "purchase", target_id: id, reason: "goodwill", scope: "full" }))).toEqual({
      target: "purchase",
      targetId: id,
      amountMinor: null,
      reason: "goodwill",
      reclaim: false,
    });
    expect(parseRefundForm(form({ target: "purchase", target_id: id, reason: "faulty", scope: "partial", amount: "4.50", reclaim: "yes" }))).toEqual({
      target: "purchase",
      targetId: id,
      amountMinor: 450,
      reason: "faulty",
      reclaim: true,
    });
    // a membership invoice never reclaims: the pool has no transfer per payment
    expect(parseRefundForm(form({ target: "invoice", target_id: id, reason: "goodwill", scope: "full", reclaim: "yes" }))?.reclaim).toBe(false);
    expect(parseRefundForm(form({ target: "purchase", target_id: id, reason: "faulty", scope: "partial", amount: "0" }))).toBeNull();
    expect(parseRefundForm(form({ target: "purchase", target_id: id, reason: "because", scope: "full" }))).toBeNull();
    expect(parseRefundForm(form({ target: "order", target_id: id, reason: "goodwill", scope: "full" }))).toBeNull();
    expect(parseRefundForm(form({ target: "purchase", target_id: "x", reason: "goodwill", scope: "full" }))).toBeNull();
  });
  it("reclaims only what the organisation now owes", () => {
    expect(reclaimAmount(500, 200)).toBe(0);
    expect(reclaimAmount(500, -200)).toBe(200);
    expect(reclaimAmount(500, -900)).toBe(500);
    expect(reclaimAmount(-5, -900)).toBe(0);
  });
  it("works out what is left and Stripe's reason", () => {
    expect(refundableMinor(1200, 300)).toBe(900);
    expect(refundableMinor(1200, 1500)).toBe(0);
    expect(stripeRefundReason("duplicate")).toBe("duplicate");
    expect(stripeRefundReason("fraud")).toBe("fraudulent");
    expect(stripeRefundReason("goodwill")).toBe("requested_by_customer");
  });
  it("classifies a search", () => {
    expect(classifyPurchaseQuery(" pi_3AbCdEf123 ")).toEqual({ column: "stripe_payment_intent_id", value: "pi_3AbCdEf123" });
    expect(classifyPurchaseQuery("cs_test_a1B2c3D4e5")).toEqual({ column: "stripe_checkout_session_id", value: "cs_test_a1B2c3D4e5" });
    expect(classifyPurchaseQuery("6F1C2A9E-1111-4222-8333-444455556666")?.column).toBe("id");
    expect(classifyPurchaseQuery("in_1AbCdEf234")).toEqual({ column: "stripe_invoice_id", value: "in_1AbCdEf234" });
    expect(classifyPurchaseQuery("someone@example.com")).toBeNull();
  });
});

describe("ledger helpers", () => {
  it("converts a settlement-currency fee back", () => {
    expect(feeFromBalanceTxn({ id: "txn_1", fee: 50, currency: "gbp", exchange_rate: null }, "GBP")).toEqual({ feeMinor: 50, balanceTxnId: "txn_1" });
    expect(feeFromBalanceTxn({ id: "txn_2", fee: 80, currency: "gbp", exchange_rate: 0.8 }, "usd")).toEqual({ feeMinor: 100, balanceTxnId: "txn_2" });
    expect(feeFromBalanceTxn({ id: "txn_3", fee: 80, currency: "gbp", exchange_rate: null }, "usd")).toBeNull();
    expect(feeFromBalanceTxn(null, "gbp")).toBeNull();
  });
  it("reads a dispute", () => {
    expect(disputeInfo({ id: "du_1", amount: 1200, currency: "gbp", payment_intent: "pi_1", created: 1_700_000_000 })).toEqual({
      id: "du_1",
      paymentIntentId: "pi_1",
      amountMinor: 1200,
      currency: "GBP",
      at: new Date(1_700_000_000_000).toISOString(),
    });
    expect(disputeInfo({ id: "du_2", amount: 1200, currency: "gbp", payment_intent: null, created: 1 })).toBeNull();
  });
});

describe("reconcile", () => {
  const w = { from: new Date("2026-10-01T00:00:00Z"), to: new Date("2026-10-04T00:00:00Z") };
  const at = (iso: string) => Date.parse(iso) / 1000;
  const txn = (o: Partial<StripeTxn>): StripeTxn => ({
    id: "txn_x",
    type: "charge",
    amount: 1200,
    fee: 50,
    currency: "gbp",
    created: at("2026-10-02T10:00:00Z"),
    exchangeRate: null,
    paymentIntentId: null,
    sourceId: null,
    ...o,
  });
  const receipt = (o: Partial<ReceiptRow>): ReceiptRow => ({
    id: "r1",
    kind: "sale",
    stripe_ref: "pi_a",
    payment_intent_id: "pi_a",
    balance_txn_id: null,
    currency: "GBP",
    gross_minor: 1200,
    fee_minor: null,
    occurred_at: "2026-10-02T10:00:00Z",
    ...o,
  });

  it("matches a charge by payment intent and learns the fee", () => {
    const r = reconcile([txn({ id: "txn_a", paymentIntentId: "pi_a" })], [receipt({})], w);
    expect(r.matched).toBe(1);
    expect(r.items).toEqual([]);
    expect(r.corrections).toEqual([{ receiptId: "r1", feeMinor: 50, balanceTxnId: "txn_a", knownFeeMinor: null }]);
  });
  it("does not correct a fee it already knows", () => {
    const r = reconcile([txn({ id: "txn_a", paymentIntentId: "pi_a" })], [receipt({ fee_minor: 50 })], w);
    expect(r.corrections).toEqual([]);
  });
  it("flags money missing on either side and amounts that disagree", () => {
    const r = reconcile(
      [
        txn({ id: "txn_b", paymentIntentId: "pi_b" }),
        txn({ id: "txn_c", paymentIntentId: "pi_c", amount: 1000 }),
        txn({ id: "txn_r", type: "refund", amount: -600, fee: 0, sourceId: "re_1" }),
        txn({ id: "txn_t", type: "transfer", amount: -5000 }),
      ],
      [
        receipt({ id: "r2", payment_intent_id: "pi_c", stripe_ref: "pi_c", fee_minor: 50 }),
        receipt({ id: "r3", payment_intent_id: "pi_z", stripe_ref: "pi_z", fee_minor: 50 }),
        receipt({ id: "r4", kind: "refund", stripe_ref: "re_1", payment_intent_id: "pi_c", gross_minor: -600, fee_minor: 0 }),
      ],
      w,
    );
    const kinds = r.items.map((i) => `${i.kind}:${i.receipt_id ?? i.balance_txn_id}`).sort();
    expect(kinds).toEqual(["amount_mismatch:r2", "missing_in_ledger:txn_b", "missing_in_stripe:r3"]);
    expect(r.stripeTxns).toBe(3);
    expect(r.matched).toBe(2);
  });
  it("ignores transactions and receipts outside the window", () => {
    const r = reconcile(
      [txn({ id: "txn_old", paymentIntentId: "pi_old", created: at("2026-09-29T10:00:00Z") })],
      [receipt({ id: "r5", payment_intent_id: "pi_new", occurred_at: "2026-10-05T10:00:00Z" })],
      w,
    );
    expect(r.items).toEqual([]);
  });
  it("converts a foreign fee and skips the amount check", () => {
    const r = reconcile(
      [txn({ id: "txn_u", paymentIntentId: "pi_u", currency: "gbp", amount: 800, fee: 40, exchangeRate: 0.8 })],
      [receipt({ id: "r6", payment_intent_id: "pi_u", stripe_ref: "pi_u", currency: "USD", gross_minor: 1000 })],
      w,
    );
    expect(r.items).toEqual([]);
    expect(r.corrections[0]?.feeMinor).toBe(50);
  });
  it("has a window that ends an hour ago, and spots test keys", () => {
    const now = new Date("2026-10-07T12:00:00Z");
    const win = reconciliationWindow(now);
    expect(win.to.toISOString()).toBe("2026-10-07T11:00:00.000Z");
    expect(win.from.toISOString()).toBe("2026-10-04T11:00:00.000Z");
    expect(isTestKey("sk_test_abc")).toBe(true);
    expect(isTestKey("rk_test_abc")).toBe(true);
    expect(isTestKey("sk_live_abc")).toBe(false);
    expect(isTestKey(undefined)).toBe(false);
  });
});

class FakeStore implements PayoutStore {
  payouts: (PendingPayout & { status: string; transfer?: string; code?: string })[] = [];
  finished: Record<string, number> | null = null;
  completeFails = false;
  async startRun() {
    return "run_1";
  }
  async pending(_livemode: boolean, onlyId?: string) {
    return this.payouts.filter((p) => p.status === "pending" && (!onlyId || p.id === onlyId));
  }
  async complete(id: string, transfer: string) {
    if (this.completeFails) throw new Error("db down");
    const p = this.payouts.find((x) => x.id === id)!;
    p.status = "paid";
    p.transfer = transfer;
  }
  async fail(id: string, code: string) {
    const p = this.payouts.find((x) => x.id === id)!;
    p.status = "failed";
    p.code = code;
  }
  async finish(_run: string, outcome: Record<string, number>) {
    this.finished = outcome;
  }
}

describe("payout run", () => {
  const payout = (id: string, dest: string | null = "acct_1"): FakeStore["payouts"][number] => ({
    id,
    org_id: "org",
    currency: "GBP",
    amount_minor: 3000,
    stripe_destination: dest,
    status: "pending",
  });

  it("transfers each pending payout once, keyed by its id", async () => {
    const store = new FakeStore();
    store.payouts.push(payout("p1"), payout("p2", null));
    const calls: { params: unknown; key: string }[] = [];
    const transfers: TransferApi = {
      async create(params, options) {
        calls.push({ params, key: options.idempotencyKey });
        return { id: "tr_1" };
      },
    };
    const r = await runPayouts(store, transfers, false, "cron");
    expect(r).toMatchObject({ runId: "run_1", paid: 1, failed: 1, errors: 0 });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ key: "akana-payout-p1", params: { amount: 3000, currency: "gbp", destination: "acct_1" } });
    expect(store.payouts.map((p) => p.status)).toEqual(["paid", "failed"]);
    expect(store.payouts[1]?.code).toBe("no_destination");
    expect(store.finished).toEqual({ paid: 1, failed: 1, errors: 0 });
  });

  it("records Stripe's refusal code and never a message", async () => {
    const store = new FakeStore();
    store.payouts.push(payout("p1"));
    const transfers: TransferApi = {
      async create() {
        throw Object.assign(new Error("You have insufficient funds in your Stripe account"), { code: "balance_insufficient" });
      },
    };
    const r = await executePayouts(store, transfers, false);
    expect(r.failed).toBe(1);
    expect(store.payouts[0]?.code).toBe("balance_insufficient");
    expect(stripeErrorCode(new Error("x"))).toBe("transfer_failed");
  });

  it("leaves a payout pending when the transfer worked but the record did not", async () => {
    const store = new FakeStore();
    store.completeFails = true;
    store.payouts.push(payout("p1"));
    const r = await executePayouts(store, { create: async () => ({ id: "tr_9" }) }, false);
    expect(r).toEqual({ paid: 0, failed: 0, errors: 1 });
    expect(store.payouts[0]?.status).toBe("pending");
  });

  it("knows the payout day in London", () => {
    // 23:30 UTC on 14 October is 00:30 on 15 October in London (BST)
    expect(isPayoutDay(new Date("2026-10-14T23:30:00Z"), 15)).toBe(true);
    expect(isPayoutDay(new Date("2026-10-14T12:00:00Z"), 15)).toBe(false);
  });
});

describe("statements", () => {
  const st: StatementRow = {
    id: "s1",
    org_id: "o1",
    period: "2026-08",
    currency: "GBP",
    livemode: false,
    opening_minor: 0,
    sales_minor: 985,
    refunds_minor: -475,
    pool_minor: 240,
    adjustments_minor: -25,
    payouts_minor: 0,
    closing_minor: 725,
    units: 1,
    line_count: 6,
    is_placeholder_rate: true,
    closed_at: "2026-09-15T00:00:00Z",
  };
  const line = (o: Partial<StatementLine>): StatementLine => ({
    workbook_id: "w1",
    kind: "sale",
    units: 1,
    gross_minor: 1200,
    tax_minor: 200,
    fee_minor: 0,
    net_base_minor: 1000,
    rate: "0.5000",
    author_minor: 500,
    note: null,
    occurred_at: "2026-08-10T12:00:00Z",
    ...o,
  });
  const lines = [
    line({}),
    line({ kind: "fee_correction", units: 0, gross_minor: 0, tax_minor: 0, fee_minor: 50, net_base_minor: -50, author_minor: -25 }),
    line({ kind: "refund", units: 0, gross_minor: -600, tax_minor: -100, net_base_minor: -500, author_minor: -237 }),
    line({ kind: "refund", units: -1, gross_minor: -600, tax_minor: -100, net_base_minor: -475, author_minor: -238 }),
    line({ workbook_id: "w2", gross_minor: 1000, tax_minor: 0, fee_minor: 30, net_base_minor: 970, author_minor: 485 }),
    line({ kind: "pool", units: 0, gross_minor: 0, tax_minor: 0, net_base_minor: 480, author_minor: 240 }),
    line({ workbook_id: null, kind: "adjustment", units: 0, gross_minor: 0, tax_minor: 0, net_base_minor: 0, rate: null, author_minor: 0, note: "=HYPERLINK(evil)" }),
  ];
  const titles = new Map([
    ["w1", { code: "AK-AAAAA", title: "First, a title" }],
    ["w2", { code: "AK-BBBBB", title: "Second" }],
  ]);

  it("sums per title and keeps the pool apart", () => {
    const m = buildStatementModel(st, lines, titles, "Ledger One");
    const w1 = m.titles.find((t) => t.code === "AK-AAAAA")!;
    expect(w1).toMatchObject({ units: 0, grossMinor: 1200, refundedGrossMinor: 1200, feeMinor: 50, salesAmountMinor: 0, poolAmountMinor: 240, amountMinor: 240, rate: "50%" });
    expect(m.titles.find((t) => t.code === "AK-BBBBB")).toMatchObject({ units: 1, salesAmountMinor: 485, feeMinor: 30 });
    expect(m.other).toHaveLength(1);
    expect(m.provisional).toBe(true);
    expect(m.method.join(" ")).toMatch(/PROVISIONAL/);
    expect(m.method.join(" ")).toMatch(/TEST MODE/);
    expect(m.method.join(" ")).toMatch(/Membership pool/);
  });

  it("writes a CSV with quoted cells and no formulas", () => {
    const csv = statementCsv(buildStatementModel(st, lines, titles, "Ledger One"));
    expect(csv.split("\r\n")[0]).toBe("section,code,title,item,units,gross,vat,fees,refunded,net_receipts,rate,amount,currency");
    expect(csv).toContain('"First, a title"');
    expect(csv).toContain("'=HYPERLINK(evil)");
    expect(csv).toContain("total,,,closing_balance,,,,,,,,7.25,GBP");
    expect(csv).toContain("meta,,,provisional,,,,,,,,yes,GBP");
    expect(csvCell("-12.50")).toBe("-12.50");
    expect(csvCell("+cmd")).toBe("'+cmd");
  });

  it("writes a PDF with a valid cross-reference table", () => {
    const bytes = statementPdf(buildStatementModel(st, lines, titles, "Ledger One"));
    const text = Buffer.from(bytes).toString("latin1");
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    const startxref = Number(/startxref\n(\d+)/.exec(text)?.[1]);
    expect(text.slice(startxref, startxref + 4)).toBe("xref");
    // every object offset points at "<n> 0 obj"
    const entries = text.slice(startxref).split("\n").slice(3).filter((l) => / 00000 n $/.test(l));
    entries.forEach((e, i) => {
      const off = Number(e.slice(0, 10));
      expect(text.slice(off, off + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`);
    });
    expect(text).toContain("Akana royalty statement");
    expect(text).toContain("PROVISIONAL");
    expect(text).not.toMatch(/reader@|user_id/);
  });

  it("marks a demo statement (0029) as demo on every surface, and a real one never", () => {
    const real = buildStatementModel(st, lines, titles, "Ledger One");
    expect(real.demo).toBe(false);
    expect(real.method.join(" ")).not.toMatch(/DEMO/);
    expect(statementCsv(real)).not.toContain("meta,,,demo");
    const m = buildStatementModel({ ...st, is_demo: true }, lines, titles, "Quillmoor Demo Press");
    expect(m.demo).toBe(true);
    expect(m.method[0]).toMatch(/^DEMO: invented figures/);
    expect(statementCsv(m)).toContain("meta,,,demo,,,,,,,,");
    expect(statementPdfLines(m)[0]?.text).toBe("Akana royalty statement (DEMO)");
    const pdf = Buffer.from(statementPdf(m)).toString("latin1");
    expect(pdf).toContain("Not a real statement");
    expect(statementFileName("PB-DEM00", m, "pdf")).toBe("akana-statement-pb-dem00-2026-08-gbp-test-demo.pdf");
  });

  it("escapes PDF strings and maps the pound sign", () => {
    expect(pdfStringBytes("(a)\\")).toEqual([0x5c, 0x28, 0x61, 0x5c, 0x29, 0x5c, 0x5c]);
    expect(pdfStringBytes("£€")).toEqual([0xa3, 0x80]);
    expect(pdfStringBytes("✓")).toEqual([63]);
  });

  it("starts a new page when one is full", () => {
    const many = Array.from({ length: 120 }, (_, i) => ({ text: `line ${i}` }));
    expect(paginate(many).length).toBeGreaterThan(1);
    const pdf = Buffer.from(buildPdf(many, { title: "t" })).toString("latin1");
    expect(pdf).toMatch(/\/Count [2-9]/);
  });

  it("wraps text and names files safely", () => {
    expect(wrap("one two three four", 9)).toEqual(["one two", "three", "four"]);
    expect(statementFileName("PB-ABC12", { period: "2026-08", currency: "GBP", livemode: false }, "pdf")).toBe("akana-statement-pb-abc12-2026-08-gbp-test.pdf");
    expect(statementFileName("../../etc", { period: "2026-08", currency: "GBP", livemode: true }, "csv")).toBe("akana-statement-etc-2026-08-gbp.csv");
  });
});

describe("royalty figures form", () => {
  const base: Record<string, string> = {
    sale_rate: "55",
    sale_rate_link: "60.5",
    pool_share: "50",
    step_cap: "20",
    activity_floor: "1",
    fee_treatment: "deduct",
    refund_window_days: "14",
    first_payout_hold_days: "30",
    payout_day: "15",
    min_GBP: "25",
    approve_GBP: "1000",
    note: "Agreed at the D1 to D5 meeting",
  };
  it("turns percentages into rates and pounds into pence", async () => {
    const { parseConfigForm, pctValue } = await import("@/lib/money/config-form");
    const out = parseConfigForm((k) => base[k]);
    expect(out).toMatchObject({
      p_sale_rate_author: 0.55,
      p_sale_rate_author_link: 0.605,
      p_min_payout_minor: { GBP: 2500 },
      p_approval_above_minor: { GBP: 100000 },
      p_payout_day: 15,
    });
    expect(parseConfigForm((k) => ({ ...base, sale_rate: "101" })[k])).toBeNull();
    expect(parseConfigForm((k) => ({ ...base, payout_day: "31" })[k])).toBeNull();
    expect(parseConfigForm((k) => ({ ...base, fee_treatment: "split" })[k])).toBeNull();
    expect(parseConfigForm((k) => ({ ...base, note: "" })[k])).toBeNull();
    expect(pctValue("0.5000")).toBe("50");
  });
});
