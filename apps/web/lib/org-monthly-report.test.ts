import { describe, expect, it } from "vitest";
import { previousMonth, reportDedupeKey, reportsUrl, runMonthlyReport, type DigestRow, type ReportEmail } from "./org-monthly-report";

describe("previousMonth", () => {
  it("is the month before, in London time", () => {
    expect(previousMonth(new Date("2026-10-02T09:27:00Z"))).toEqual({ start: "2026-09-01", key: "2026-09", label: "September 2026" });
  });
  it("rolls back over a new year", () => {
    expect(previousMonth(new Date("2027-01-02T09:00:00Z"))).toEqual({ start: "2026-12-01", key: "2026-12", label: "December 2026" });
  });
  it("uses London's calendar at a month boundary", () => {
    // 23:30 UTC on 30 September is 00:30 on 1 October in London (BST).
    expect(previousMonth(new Date("2026-09-30T23:30:00Z")).key).toBe("2026-09");
  });
});

const row = (o: Partial<DigestRow> = {}): DigestRow => ({ orgId: "o1", organisationName: "Harbour", seatsTaken: 12, peopleStarted: 7, groupsMeeting: 1, threshold: 5, ...o });

function setup(rows: DigestRow[], contacts: Record<string, { userId: string | null; email: string; role: string }[]>, status: "sent" | "dupe" | "fail" = "sent") {
  const sent: { email: ReportEmail; to: string; key: string }[] = [];
  const logs: string[] = [];
  const deps = {
    now: new Date("2026-10-02T09:27:00Z"),
    origin: "https://akana.example",
    supportEmail: "s@example.test",
    async digest(month: string) {
      expect(month).toBe("2026-09-01");
      return rows;
    },
    async recipients(orgId: string) {
      return contacts[orgId] ?? [];
    },
    async send(email: ReportEmail, opts: { to: string; userId: string | null; dedupeKey: string }) {
      sent.push({ email, to: opts.to, key: opts.dedupeKey });
      return status === "sent" ? { status: "sent" as const } : status === "dupe" ? { status: "skipped" as const, reason: "already_sent" } : { status: "failed" as const, reason: "boom" };
    },
    log: (c: string) => logs.push(c),
  };
  return { deps, sent, logs };
}

describe("runMonthlyReport", () => {
  const owner = { userId: "u1", email: "owner@example.test", role: "owner" };
  const fin = { userId: null, email: "fin@example.test", role: "finance" };

  it("sends to owners and finance with a link to Reports", async () => {
    const { deps, sent } = setup([row()], { o1: [owner, fin] });
    const run = await runMonthlyReport(deps);
    expect(run).toMatchObject({ month: "2026-09", organisations: 1, sent: 2, failed: 0 });
    expect(sent[0]!.email.reportsUrl).toBe("https://akana.example/org/reports?org=o1");
    expect(sent[0]!.email.month).toBe("September 2026");
  });

  it("passes a hidden started figure through as null", async () => {
    const { deps, sent } = setup([row({ peopleStarted: null })], { o1: [owner] });
    await runMonthlyReport(deps);
    expect(sent[0]!.email.peopleStarted).toBeNull();
  });

  it("sends nothing for an organisation under the threshold", async () => {
    const { deps, sent } = setup([row({ seatsTaken: 4 })], { o1: [owner] });
    const run = await runMonthlyReport(deps);
    expect(run.skipped_small).toBe(1);
    expect(sent).toHaveLength(0);
  });

  it("counts organisations with nobody to tell", async () => {
    const { deps } = setup([row()], {});
    expect((await runMonthlyReport(deps)).no_contacts).toBe(1);
  });

  it("keys each send by organisation, month and person, never an address", async () => {
    const { deps, sent } = setup([row()], { o1: [owner, fin] });
    await runMonthlyReport(deps);
    expect(sent[0]!.key).toBe("org_monthly_report:o1:2026-09:u1");
    expect(sent[1]!.key).toMatch(/^org_monthly_report:o1:2026-09:b[0-9a-f]{24}$/);
    expect(sent.map((s) => s.key).join(" ")).not.toContain("@");
    expect(reportDedupeKey("o1", "2026-09", owner)).toBe(sent[0]!.key);
  });

  it("counts a repeat run as already sent", async () => {
    const { deps } = setup([row()], { o1: [owner] }, "dupe");
    expect(await runMonthlyReport(deps)).toMatchObject({ sent: 0, already_sent: 1, failed: 0 });
  });

  it("counts failures without stopping, and logs no address", async () => {
    const { deps, logs } = setup([row(), row({ orgId: "o2" })], { o1: [owner], o2: [owner] }, "fail");
    const run = await runMonthlyReport(deps);
    expect(run.failed).toBe(2);
    expect(logs).toEqual(["org_monthly_report_send_failed", "org_monthly_report_send_failed"]);
  });

  it("survives a throwing sender", async () => {
    const { deps } = setup([row()], { o1: [owner] });
    deps.send = async () => {
      throw new Error("x");
    };
    expect((await runMonthlyReport(deps)).failed).toBe(1);
  });

  it("builds the reports link", () => {
    expect(reportsUrl("https://a.test", "o9")).toBe("https://a.test/org/reports?org=o9");
  });
});
