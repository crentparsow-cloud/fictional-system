import { describe, expect, it } from "vitest";
import type { OutboundMessage } from "@akana/emails";
import { sendTermsReminder } from "@/lib/membership-email";
import {
  addMonthsUtc,
  runTermsReminders,
  termsReminderDedupeKey,
  termsReminderDue,
  withinTermsReminderWindow,
  type DueTermsReminder,
  type TermsReminder,
  type TermsReminderCandidate,
} from "@/lib/membership-reminders";

/**
 * The six-monthly terms reminder for monthly members (DMCC subscription
 * regime). The rule as a pure function, the job over fakes, and the email
 * as it renders. No network and no database.
 */

const NOW = new Date("2027-03-10T09:00:00Z");
const DAY = 86_400_000;
const daysOn = (n: number) => new Date(NOW.getTime() + n * DAY).toISOString();

function candidate(over: Partial<TermsReminderCandidate> = {}): TermsReminderCandidate {
  return {
    plan: "member_month",
    status: "active",
    cancelAtPeriodEnd: false,
    cancelAt: null,
    endedAt: null,
    currentPeriodEnd: daysOn(7),
    startedAt: "2026-09-01T12:00:00Z",
    lastTermsReminderAt: null,
    ...over,
  };
}

describe("addMonthsUtc", () => {
  it("adds calendar months and holds the day", () => {
    expect(addMonthsUtc(new Date("2026-09-10T09:00:00Z"), 6).toISOString()).toBe("2027-03-10T09:00:00.000Z");
    expect(addMonthsUtc(new Date("2026-11-15T00:00:00Z"), 6).toISOString()).toBe("2027-05-15T00:00:00.000Z");
  });

  it("uses the last day of a shorter month, as Postgres does", () => {
    expect(addMonthsUtc(new Date("2026-08-31T10:00:00Z"), 6).toISOString()).toBe("2027-02-28T10:00:00.000Z");
    expect(addMonthsUtc(new Date("2027-08-31T10:00:00Z"), 6).toISOString()).toBe("2028-02-29T10:00:00.000Z");
  });
});

describe("the selection rule", () => {
  it("is due six months after the start, with a renewal 3 to 14 days away", () => {
    expect(termsReminderDue(candidate(), NOW)).toBe(true);
    expect(termsReminderDue(candidate({ startedAt: "2026-09-10T09:00:00Z" }), NOW)).toBe(true);
  });

  it("is not due before six months have passed", () => {
    expect(termsReminderDue(candidate({ startedAt: "2026-09-10T09:00:01Z" }), NOW)).toBe(false);
    expect(termsReminderDue(candidate({ startedAt: "2026-12-01T00:00:00Z" }), NOW)).toBe(false);
  });

  it("counts six months from the last reminder when there has been one", () => {
    expect(termsReminderDue(candidate({ startedAt: "2024-01-01T00:00:00Z", lastTermsReminderAt: "2027-01-05T00:00:00Z" }), NOW)).toBe(false);
    expect(termsReminderDue(candidate({ startedAt: "2024-01-01T00:00:00Z", lastTermsReminderAt: "2026-09-09T00:00:00Z" }), NOW)).toBe(true);
  });

  it("needs the next renewal between 3 and 14 days away, both ends inside", () => {
    expect(termsReminderDue(candidate({ currentPeriodEnd: daysOn(3) }), NOW)).toBe(true);
    expect(termsReminderDue(candidate({ currentPeriodEnd: daysOn(14) }), NOW)).toBe(true);
    expect(termsReminderDue(candidate({ currentPeriodEnd: daysOn(2.9) }), NOW)).toBe(false);
    expect(termsReminderDue(candidate({ currentPeriodEnd: daysOn(14.1) }), NOW)).toBe(false);
    expect(termsReminderDue(candidate({ currentPeriodEnd: daysOn(-1) }), NOW)).toBe(false);
    expect(termsReminderDue(candidate({ currentPeriodEnd: null }), NOW)).toBe(false);
  });

  it("is only for live monthly memberships that are not set to end", () => {
    expect(termsReminderDue(candidate({ plan: "member_year" }), NOW)).toBe(false);
    expect(termsReminderDue(candidate({ plan: null }), NOW)).toBe(false);
    expect(termsReminderDue(candidate({ status: "trialing" }), NOW)).toBe(true);
    for (const status of ["past_due", "canceled", "unpaid", "incomplete", "paused"]) {
      expect(termsReminderDue(candidate({ status }), NOW), status).toBe(false);
    }
    expect(termsReminderDue(candidate({ cancelAtPeriodEnd: true }), NOW)).toBe(false);
    expect(termsReminderDue(candidate({ cancelAt: daysOn(7) }), NOW)).toBe(false);
    expect(termsReminderDue(candidate({ endedAt: daysOn(-1) }), NOW)).toBe(false);
  });

  it("has a window function that agrees", () => {
    expect(withinTermsReminderWindow(new Date("2026-09-01T00:00:00Z"), new Date(daysOn(7)), NOW)).toBe(true);
    expect(withinTermsReminderWindow(new Date("2026-10-01T00:00:00Z"), new Date(daysOn(7)), NOW)).toBe(false);
  });

  it("keys one reminder per subscription and next payment date, with no address", () => {
    expect(termsReminderDedupeKey("sub_1", "2027-03-17T09:00:00.000Z")).toBe("membership_terms_reminder:sub_1:2027-03-17");
    expect(termsReminderDedupeKey("sub_1", "2027-03-17T09:00:00.000Z")).not.toMatch(/@/);
  });
});

function due(over: Partial<DueTermsReminder> = {}): DueTermsReminder {
  return {
    subscriptionId: "sub_1",
    email: "reader@example.com",
    currentPeriodEnd: daysOn(7),
    reminderAnchorAt: "2026-09-01T12:00:00.000Z",
    amountMinor: 799,
    currency: "GBP",
    ...over,
  };
}

/** A fake of the job's world: the due list, the mailer's claim and the stamp. */
function world(rows: DueTermsReminder[]) {
  const claimed = new Set<string>();
  const stamped: [string, string][] = [];
  const sent: TermsReminder[] = [];
  let failSend = false;
  let failStamp = false;
  const logs: string[] = [];
  return {
    claimed,
    stamped,
    sent,
    logs,
    failSendNext: () => (failSend = true),
    failStampNext: () => (failStamp = true),
    deps: {
      now: NOW,
      async due(now: Date) {
        expect(now).toBe(NOW);
        return rows.filter((r) => !stamped.some(([id]) => id === r.subscriptionId));
      },
      async send(r: TermsReminder) {
        if (claimed.has(r.dedupeKey)) return { status: "skipped" as const, reason: "already_sent" };
        if (failSend) {
          failSend = false;
          return { status: "failed" as const, reason: "down" };
        }
        claimed.add(r.dedupeKey);
        sent.push(r);
        return { status: "sent" as const };
      },
      async markSent(id: string, at: Date) {
        if (failStamp) {
          failStamp = false;
          throw new Error("sql");
        }
        stamped.push([id, at.toISOString()]);
      },
      log: (code: string) => void logs.push(code),
    },
  };
}

describe("runTermsReminders", () => {
  it("sends each due reminder with the price, the date and the key, then stamps it", async () => {
    const w = world([due(), due({ subscriptionId: "sub_2", email: "two@example.com", amountMinor: 849 })]);
    const out = await runTermsReminders(w.deps);
    expect(out).toEqual({ due: 2, sent: 2, already_sent: 0, no_price: 0, not_due: 0, failed: 0, stamp_failed: 0 });
    expect(w.sent[0]).toEqual({
      to: "reader@example.com",
      subscriptionId: "sub_1",
      nextPaymentAt: daysOn(7),
      amountMinor: 799,
      currency: "GBP",
      dedupeKey: `membership_terms_reminder:sub_1:${daysOn(7).slice(0, 10)}`,
    });
    expect(w.stamped).toEqual([
      ["sub_1", NOW.toISOString()],
      ["sub_2", NOW.toISOString()],
    ]);
  });

  it("never sends twice: a second run finds nothing due", async () => {
    const w = world([due()]);
    await runTermsReminders(w.deps);
    const again = await runTermsReminders(w.deps);
    expect(again).toMatchObject({ due: 0, sent: 0 });
    expect(w.sent).toHaveLength(1);
  });

  it("stamps without sending when the claim shows an earlier run sent it but failed to stamp", async () => {
    const w = world([due()]);
    w.failStampNext();
    const first = await runTermsReminders(w.deps);
    expect(first).toMatchObject({ sent: 1, stamp_failed: 1 });
    expect(w.stamped).toEqual([]);
    const second = await runTermsReminders(w.deps);
    expect(second).toMatchObject({ sent: 0, already_sent: 1, stamp_failed: 0 });
    expect(w.sent).toHaveLength(1);
    expect(w.stamped).toHaveLength(1);
  });

  it("leaves a failed send unstamped so the next run tries again, and carries on with the rest", async () => {
    const w = world([due(), due({ subscriptionId: "sub_2" })]);
    w.failSendNext();
    const first = await runTermsReminders(w.deps);
    expect(first).toMatchObject({ due: 2, sent: 1, failed: 1 });
    expect(w.stamped.map(([id]) => id)).toEqual(["sub_2"]);
    expect(w.logs).toContain("terms_reminder_send_failed");
    const second = await runTermsReminders(w.deps);
    expect(second).toMatchObject({ due: 1, sent: 1, failed: 0 });
  });

  it("counts a send that throws as failed", async () => {
    const w = world([due()]);
    w.deps.send = async () => {
      throw new Error("boom");
    };
    expect(await runTermsReminders(w.deps)).toMatchObject({ failed: 1, sent: 0 });
    expect(w.stamped).toEqual([]);
  });

  it("skips a row with no price on record, and one the window rule rejects", async () => {
    const w = world([due({ amountMinor: null, currency: null }), due({ subscriptionId: "sub_3", currentPeriodEnd: daysOn(1) }), due({ subscriptionId: "sub_4", reminderAnchorAt: "2027-01-01T00:00:00Z" })]);
    expect(await runTermsReminders(w.deps)).toEqual({ due: 3, sent: 0, already_sent: 0, no_price: 1, not_due: 2, failed: 0, stamp_failed: 0 });
    expect(w.sent).toEqual([]);
    expect(w.stamped).toEqual([]);
  });

  it("lets a database error on the due list through, so the route answers 500", async () => {
    const w = world([]);
    w.deps.due = async () => {
      throw new Error("sql");
    };
    await expect(runTermsReminders(w.deps)).rejects.toThrow();
  });
});

describe("sendTermsReminder: the email", () => {
  const env = { EMAIL_MODE: "live", EMAIL_FROM: "Akana <hello@akana.test>", POSTAL_ADDRESS: "Akana Ltd, 1 Example Street, Edinburgh" };
  const reminder: TermsReminder = {
    to: "reader@example.com",
    subscriptionId: "sub_1",
    nextPaymentAt: "2027-03-17T09:00:00.000Z",
    amountMinor: 799,
    currency: "GBP",
    dedupeKey: "membership_terms_reminder:sub_1:2027-03-17",
  };

  it("states the price, how often, the next payment date and how to cancel, and names no title", async () => {
    const sent: OutboundMessage[] = [];
    const claimed = new Set<string>();
    const deps = {
      env,
      claim: (k: string) => (claimed.has(k) ? false : (claimed.add(k), true)),
      release: (k: string) => void claimed.delete(k),
      log: () => {},
      transport: async (m: OutboundMessage) => {
        sent.push(m);
        return { ok: true as const, id: "re_1" };
      },
    };
    expect((await sendTermsReminder(reminder, "https://akana.test", deps)).status).toBe("sent");
    expect((await sendTermsReminder(reminder, "https://akana.test", deps)).status).toBe("skipped");
    expect(sent).toHaveLength(1);
    const msg = sent[0]!;
    expect(msg.to).toBe("reader@example.com");
    expect(msg.subject).toBe("A reminder of your membership terms");
    expect(msg.text).toContain("£7.99 a month");
    expect(msg.text).toContain("Every month, automatically, until you cancel");
    expect(msg.text).toContain("17 March 2027");
    expect(msg.text).toContain("go to You, then Manage membership, then Cancel");
    expect(msg.text).toContain("every six months");
    expect(msg.text).toContain("https://akana.test/you#membership");
    expect(msg.text).not.toMatch(/—/);
    expect(msg.text).not.toMatch(/title/i);
  });

  it("releases the claim when the send fails, so the next run can send it", async () => {
    const claimed = new Set<string>();
    const deps = {
      env,
      claim: (k: string) => (claimed.has(k) ? false : (claimed.add(k), true)),
      release: (k: string) => void claimed.delete(k),
      log: () => {},
      transport: async () => ({ ok: false as const, error: "down" }),
    };
    expect((await sendTermsReminder(reminder, "https://akana.test", deps)).status).toBe("failed");
    expect(claimed.size).toBe(0);
  });
});
