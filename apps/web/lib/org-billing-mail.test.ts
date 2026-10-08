import { describe, expect, it } from "vitest";
import { renderOrganisation } from "@akana/emails";
import { bandDirection, bandProration, billingErrorNotice, coolingOffText, isBandPlan } from "@/lib/org-billing";
import {
  orgReminderInWindow,
  outboxEmail,
  recipientKey,
  runOrgBillingMail,
  runOrgTermsReminders,
  type BillingContact,
  type BillingEmail,
  type DueOrgReminder,
  type OutboxRow,
} from "@/lib/org-billing-mail";

const NOW = new Date("2026-10-08T09:00:00Z");
const ORG = "a0310000-0000-0000-0000-0000000000f2";
const CONTACTS: BillingContact[] = [
  { userId: "a0310000-0000-0000-0000-000000000003", email: "owner@work.example", role: "owner" },
  { userId: null, email: "accounts@work.example", role: "billing" },
];

function row(over: Partial<OutboxRow> = {}): OutboxRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    kind: "invoice_sent",
    orgId: ORG,
    organisationName: "Biz 31",
    consumer: false,
    relevant: true,
    invoiceNumber: "B31-0001",
    amountMinor: 6000,
    currency: "GBP",
    dueAt: "2026-11-07T00:00:00Z",
    payUrl: "https://invoice.stripe.com/i/x",
    graceUntil: null,
    happensAt: null,
    refundMinor: null,
    refundCurrency: null,
    refundState: null,
    ...over,
  };
}

const ctx = { origin: "https://akana.test", supportEmail: "help@akana.test", now: NOW };

describe("billing outbox emails", () => {
  it("writes each kind, with the Billing link and no member", () => {
    const kinds: OutboxRow["kind"][] = ["invoice_sent", "payment_failed", "invoice_overdue", "licence_suspended", "licence_ending", "licence_ended"];
    for (const kind of kinds) {
      const e = outboxEmail(row({ kind, happensAt: "2026-11-01T00:00:00Z" }), ctx)!;
      const r = renderOrganisation(e.template, e.props as never);
      expect(r.text).toContain(`https://akana.test/org/billing?org=${ORG}`);
      expect(r.text).not.toContain("@work.example");
    }
  });

  it("puts the amount, due date and pay link on the invoice email", () => {
    const e = outboxEmail(row(), ctx)!;
    expect(e.template).toBe("org_invoice_sent");
    const r = renderOrganisation(e.template, e.props as never);
    expect(r.text).toContain("£60.00");
    expect(r.text).toContain("7 November 2026");
  });

  it("adds a cooling-off refund to the ended email only when there is one", () => {
    const e = outboxEmail(row({ kind: "licence_ended", happensAt: NOW.toISOString(), refundMinor: 1260, refundCurrency: "GBP", refundState: "pending" }), ctx)!;
    expect(renderOrganisation(e.template, e.props as never).text).toContain("£12.60");
    const plain = outboxEmail(row({ kind: "licence_ended", happensAt: NOW.toISOString() }), ctx)!;
    expect(renderOrganisation(plain.template, plain.props as never).text).not.toContain("refund");
  });

  it("keys a billing address by a hash, never the address", () => {
    expect(recipientKey(CONTACTS[0]!)).toBe(CONTACTS[0]!.userId);
    const k = recipientKey(CONTACTS[1]!);
    expect(k).not.toContain("@");
    expect(k).toMatch(/^b[0-9a-f]{24}$/);
  });
});

describe("runOrgBillingMail", () => {
  function deps(rows: OutboxRow[], result: (to: string) => { status: "sent" | "failed" | "skipped"; reason?: string } = () => ({ status: "sent" })) {
    const sent: { to: string; key: string; template: string }[] = [];
    const done: [string, boolean][] = [];
    return {
      sent,
      done,
      d: {
        now: NOW,
        origin: ctx.origin,
        supportEmail: ctx.supportEmail,
        due: async () => rows,
        contacts: async () => CONTACTS,
        send: async (e: BillingEmail, o: { to: string; dedupeKey: string }) => {
          sent.push({ to: o.to, key: o.dedupeKey, template: e.template });
          return result(o.to);
        },
        done: async (id: string, ok: boolean) => {
          done.push([id, ok]);
        },
      },
    };
  }

  it("sends each row to every contact once and marks it done", async () => {
    const t = deps([row()]);
    const run = await runOrgBillingMail(t.d);
    expect(run).toMatchObject({ rows: 1, sent: 2, failed: 0 });
    expect(t.sent.map((s) => s.key)).toEqual([
      `org_billing_mail:${row().id}:${CONTACTS[0]!.userId}`,
      `org_billing_mail:${row().id}:${recipientKey(CONTACTS[1]!)}`,
    ]);
    expect(t.done).toEqual([[row().id, true]]);
  });

  it("counts a send that went before as done, and keeps a failed row for the next run", async () => {
    const again = deps([row()], () => ({ status: "skipped", reason: "already_sent" }));
    expect((await runOrgBillingMail(again.d)).already_sent).toBe(2);
    expect(again.done).toEqual([[row().id, true]]);
    const bad = deps([row()], (to) => (to.startsWith("owner") ? { status: "failed" } : { status: "sent" }));
    expect((await runOrgBillingMail(bad.d)).failed).toBe(1);
    expect(bad.done).toEqual([[row().id, false]]);
  });

  it("sends nothing for a row that no longer applies", async () => {
    const t = deps([row({ relevant: false })]);
    const run = await runOrgBillingMail(t.d);
    expect(run.not_relevant).toBe(1);
    expect(t.sent).toEqual([]);
    expect(t.done).toEqual([[row().id, true]]);
  });
});

describe("consumer reminder notices", () => {
  const due = (over: Partial<DueOrgReminder> = {}): DueOrgReminder => ({
    subscriptionId: "sub_G31",
    orgId: ORG,
    organisationName: "Book Club",
    yearly: false,
    seats: 6,
    currentPeriodEnd: "2026-10-15T00:00:00Z",
    reminderAnchorAt: "2026-03-01T00:00:00Z",
    amountMinor: 1800,
    currency: "GBP",
    ...over,
  });

  it("keeps the timing rule: six months for monthly, 3 to 30 days ahead for yearly", () => {
    expect(orgReminderInWindow(due(), NOW)).toBe(true);
    expect(orgReminderInWindow(due({ reminderAnchorAt: "2026-06-01T00:00:00Z" }), NOW)).toBe(false);
    expect(orgReminderInWindow(due({ yearly: true, currentPeriodEnd: "2026-11-01T00:00:00Z" }), NOW)).toBe(true);
    expect(orgReminderInWindow(due({ yearly: true, currentPeriodEnd: "2026-11-20T00:00:00Z" }), NOW)).toBe(false);
  });

  it("sends the price and stamps the subscription once everyone has it", async () => {
    const sent: BillingEmail[] = [];
    const stamped: string[] = [];
    const run = await runOrgTermsReminders({
      now: NOW,
      origin: ctx.origin,
      supportEmail: ctx.supportEmail,
      due: async () => [due(), due({ subscriptionId: "sub_NP", amountMinor: null })],
      contacts: async () => CONTACTS,
      send: async (e) => {
        sent.push(e);
        return { status: "sent" };
      },
      markSent: async (s) => {
        stamped.push(s);
      },
    });
    expect(run).toMatchObject({ due: 2, sent: 2, no_price: 1, stamp_failed: 0 });
    expect(stamped).toEqual(["sub_G31"]);
    const r = renderOrganisation(sent[0]!.template, sent[0]!.props as never);
    expect(r.text).toContain("£18.00");
    expect(r.text).toContain("15 October 2026");
  });
});

describe("bands and cooling-off helpers", () => {
  it("knows the bands and how to prorate a change", () => {
    expect(isBandPlan("church_band_2")).toBe(true);
    expect(isBandPlan("teams_seat_year")).toBe(false);
    expect(bandDirection("church_band_1", "church_band_3")).toBe("up");
    expect(bandDirection("church_band_3", "church_band_2")).toBe("down");
    expect(bandDirection("church_band_2", "church_band_2")).toBe("same");
    expect(bandProration("up")).toBe("always_invoice");
    expect(bandProration("down")).toBe("create_prorations");
    expect(bandProration("up", false)).toBe("none");
  });

  it("words the cooling-off for the start and a renewal, and maps AKO31", () => {
    expect(coolingOffText("open", "start", "22 October 2026")).toContain("22 October 2026");
    expect(coolingOffText("open", "renewal", null)).toMatch(/renewed/);
    expect(coolingOffText("closed", null, null)).toBeNull();
    expect(billingErrorNotice("AKO31")).toBe("cooling_off_closed");
  });
});
