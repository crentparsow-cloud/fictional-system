import { describe, expect, it } from "vitest";
import { step } from "@/lib/today/fixtures";
import { pickupAllowed, runPickup, runReminders, type Outgoing, type PickupDeps, type ReminderTarget, type RunDeps, type SendOutcome } from "@/lib/today/run-reminders";

// Monday 12 October 2026, 09:30 London (BST): inside the window for a 09:00 reminder.
const now = new Date("2026-10-12T08:30:00Z");

const target = (over: Partial<ReminderTarget> = {}): ReminderTarget => ({
  enrolmentId: "e1",
  userId: "u1",
  email: "reader@example.test",
  safetyTier: "none",
  lastOpenedAt: "2026-10-10T10:00:00Z",
  lastActivity: new Date("2026-10-10T10:00:00Z"),
  sentSinceActivity: 0,
  days: [1, 3, 5],
  time: "09:00",
  timeZone: "Europe/London",
  pickupOn: null,
  ...over,
});

function harness(targets: ReminderTarget[], opts: { claimed?: Set<string>; steps?: boolean; failSend?: boolean } = {}) {
  const claimed = opts.claimed ?? new Set<string>();
  const sent: Outgoing[] = [];
  const logged: { kind: string; ref: string | null }[] = [];
  const stopped: string[] = [];
  const deps: RunDeps = {
    now,
    targets: async () => targets,
    stepFor: async () => (opts.steps === false ? null : { step: step(3, "plan_first_step", { unitName: "Plan your first small step" }), unitWord: "week", titles: ["Some Workbook"] }),
    async send(mail): Promise<SendOutcome> {
      if (opts.failSend) return "failed";
      if (claimed.has(mail.key)) return "already_sent";
      claimed.add(mail.key);
      sent.push(mail);
      return "sent";
    },
    async logSent(_t, kind, ref) {
      logged.push({ kind, ref });
    },
    async stop(id) {
      stopped.push(id);
    },
  };
  return { deps, sent, logged, stopped, claimed };
}

describe("runReminders", () => {
  it("sends the step by its unit name with a key per reader, programme, step and day", async () => {
    const h = harness([target()]);
    const counts = await runReminders(h.deps);
    expect(counts).toMatchObject({ considered: 1, sent: 1, failed: 0 });
    const mail = h.sent[0];
    expect(mail?.kind).toBe("step");
    if (mail?.kind === "step") {
      expect(mail.naming.stepName).toBe("Plan your first small step");
      expect(mail.naming.subjectLabel).toBe("Plan your first small step");
      expect(mail.key).toBe("step-reminder:u1:e1:plan_first_step:2026-10-12");
    }
    expect(h.logged).toEqual([{ kind: "step", ref: "plan_first_step" }]);
  });

  it("is idempotent: a second run, or a second scheduler, sends nothing new", async () => {
    const h = harness([target()]);
    await runReminders(h.deps);
    const again = await runReminders(h.deps);
    expect(h.sent).toHaveLength(1);
    expect(again).toMatchObject({ sent: 0, already_sent: 1 });
  });

  it("does nothing outside the chosen day and time", async () => {
    const early = harness([target({ time: "11:00" })]);
    expect((await runReminders(early.deps)).not_due).toBe(1);
    const wrongDay = harness([target({ days: [2, 4] })]);
    expect((await runReminders(wrongDay.deps)).not_due).toBe(1);
    expect(early.sent.length + wrongDay.sent.length).toBe(0);
  });

  it("sends the one stopping email after N unanswered reminders, then turns the reminders off", async () => {
    const h = harness([target({ sentSinceActivity: 4 })]);
    const counts = await runReminders(h.deps);
    expect(counts).toMatchObject({ stopped: 1, sent: 0 });
    expect(h.sent.map((m) => m.kind)).toEqual(["stopping"]);
    expect(h.stopped).toEqual(["e1"]);
    expect(h.logged).toEqual([{ kind: "stopping", ref: null }]);
  });

  it("does not send a fifth reminder, and sends the fourth", async () => {
    const fourth = harness([target({ sentSinceActivity: 3 })]);
    await runReminders(fourth.deps);
    expect(fourth.sent.map((m) => m.kind)).toEqual(["step"]);
    const fifth = harness([target({ sentSinceActivity: 4 })]);
    await runReminders(fifth.deps);
    expect(fifth.sent.map((m) => m.kind)).not.toContain("step");
  });

  it("takes N from the settings", async () => {
    const h = harness([target({ sentSinceActivity: 2 })]);
    h.deps.stopAfter = 2;
    await runReminders(h.deps);
    expect(h.sent.map((m) => m.kind)).toEqual(["stopping"]);
  });

  it("stops a programme whose stopping email was already claimed, without sending it twice", async () => {
    const claimed = new Set(["reminder-stop:e1:2026-10-12"]);
    const h = harness([target({ sentSinceActivity: 4 })], { claimed });
    const counts = await runReminders(h.deps);
    expect(h.sent).toHaveLength(0);
    expect(counts.already_sent).toBe(1);
    expect(h.stopped).toEqual(["e1"]);
  });

  it("leaves reminders on when the stopping email fails to send", async () => {
    const h = harness([target({ sentSinceActivity: 4 })], { failSend: true });
    const counts = await runReminders(h.deps);
    expect(counts.failed).toBe(1);
    expect(h.stopped).toEqual([]);
  });

  it("sends one email a day to a reader with two programmes due", async () => {
    const h = harness([
      target({ enrolmentId: "e1", lastOpenedAt: "2026-10-01T00:00:00Z" }),
      target({ enrolmentId: "e2", lastOpenedAt: "2026-10-09T00:00:00Z" }),
    ]);
    await runReminders(h.deps);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]?.target.enrolmentId).toBe("e2");
  });

  it("says nothing when every step is done", async () => {
    const h = harness([target()], { steps: false });
    const counts = await runReminders(h.deps);
    expect(counts.no_step).toBe(1);
    expect(h.sent).toHaveLength(0);
  });

  it("names a wellbeing title's step by number alone in the subject", async () => {
    const h = harness([target({ safetyTier: "standard" })]);
    await runReminders(h.deps);
    const mail = h.sent[0];
    expect(mail?.kind === "step" && mail.naming.subjectLabel).toBe("Week 3");
  });

  it("counts a failed send and carries on", async () => {
    const h = harness([target(), target({ enrolmentId: "e2", userId: "u2" })], { failSend: true });
    const counts = await runReminders(h.deps);
    expect(counts.failed).toBe(2);
    expect(h.logged).toEqual([]);
  });
});

describe("runPickup (4.9)", () => {
  function pickup(targets: ReminderTarget[], opts: { recent?: boolean; claimed?: Set<string> } = {}) {
    const claimed = opts.claimed ?? new Set<string>();
    const sent: Outgoing[] = [];
    const deps: PickupDeps = {
      now,
      targets: async () => targets,
      recentlyMailed: async () => opts.recent === true,
      async send(mail) {
        if (claimed.has(mail.key)) return "already_sent";
        claimed.add(mail.key);
        sent.push(mail);
        return "sent";
      },
      logSent: async () => undefined,
      localDate: () => "2026-10-12",
    };
    return { deps, sent };
  }
  const away = (over: Partial<ReminderTarget> = {}) => target({ lastOpenedAt: "2026-09-20T10:00:00Z", lastActivity: new Date("2026-09-20T10:00:00Z"), ...over });

  it("sends one welcome back after 14 days or more, keyed to the gap", async () => {
    const p = pickup([away()]);
    const counts = await runPickup(p.deps);
    expect(counts.sent).toBe(1);
    expect(p.sent[0]).toMatchObject({ kind: "welcome_back", key: "welcome-back:e1:2026-09-20" });
  });

  it("sends nothing before the gap, and nothing twice", async () => {
    expect((await runPickup(pickup([target()]).deps)).no_gap).toBe(1);
    const claimed = new Set<string>();
    const first = pickup([away()], { claimed });
    await runPickup(first.deps);
    const second = pickup([away()], { claimed });
    const counts = await runPickup(second.deps);
    expect(counts.already_sent).toBe(1);
    expect(second.sent).toHaveLength(0);
  });

  it("leaves wellbeing titles alone until the reader turns the note on", async () => {
    expect(pickupAllowed(null, "standard")).toBe(false);
    expect(pickupAllowed(null, "higher")).toBe(false);
    expect(pickupAllowed(true, "standard")).toBe(true);
    expect(pickupAllowed(null, "none")).toBe(true);
    expect(pickupAllowed(false, "none")).toBe(false);
    const p = pickup([away({ safetyTier: "standard" })]);
    expect((await runPickup(p.deps)).not_allowed).toBe(1);
    expect(p.sent).toHaveLength(0);
    const on = pickup([away({ safetyTier: "standard", pickupOn: true })]);
    expect((await runPickup(on.deps)).sent).toBe(1);
  });

  it("skips a programme mailed in the last day and a half", async () => {
    const p = pickup([away()], { recent: true });
    expect((await runPickup(p.deps)).recently_mailed).toBe(1);
    expect(p.sent).toHaveLength(0);
  });

  it("sends one a day to a reader with two programmes", async () => {
    const p = pickup([away({ enrolmentId: "e1" }), away({ enrolmentId: "e2", lastOpenedAt: "2026-09-25T00:00:00Z" })]);
    await runPickup(p.deps);
    expect(p.sent).toHaveLength(1);
    expect(p.sent[0]?.target.enrolmentId).toBe("e2");
  });
});
