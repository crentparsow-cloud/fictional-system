import { describe, expect, it } from "vitest";
import { runDailyPush, type PushDeps, type PushOutcome, type PushSubscriptionRef } from "@/lib/push/run";
import type { ReminderTarget } from "@/lib/today/run-reminders";

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

function harness(
  targets: ReminderTarget[],
  opts: { flag?: boolean; subs?: Record<string, PushSubscriptionRef[]>; pushed?: number; waiting?: boolean; claimed?: Set<string>; outcome?: PushOutcome } = {},
) {
  const claimed = opts.claimed ?? new Set<string>();
  const sentTo: string[] = [];
  const removed: string[] = [];
  const released: string[] = [];
  const subs = opts.subs ?? { u1: [{ id: "s1", endpoint: "https://push.example/1" }] };
  const deps: PushDeps = {
    now,
    targets: async () => targets,
    flagOn: () => opts.flag !== false,
    subscriptions: (u) => subs[u] ?? [],
    pushedSince: async () => opts.pushed ?? 0,
    stepWaiting: async () => opts.waiting !== false,
    claim: async (u, d) => {
      const k = `${u}:${d}`;
      if (claimed.has(k)) return false;
      claimed.add(k);
      return true;
    },
    release: async (u, d) => {
      claimed.delete(`${u}:${d}`);
      released.push(`${u}:${d}`);
    },
    send: async (sub) => {
      sentTo.push(sub.id);
      return opts.outcome ?? "sent";
    },
    remove: async (id) => {
      removed.push(id);
    },
  };
  return { deps, sentTo, removed, released, claimed };
}

describe("runDailyPush", () => {
  it("sends one push to a due reader with a device and a step waiting", async () => {
    const h = harness([target()]);
    const counts = await runDailyPush(h.deps);
    expect(counts.sent).toBe(1);
    expect(h.sentTo).toEqual(["s1"]);
  });

  it("sends nothing the second time round (the claim holds)", async () => {
    const claimed = new Set<string>();
    await runDailyPush(harness([target()], { claimed }).deps);
    const again = harness([target()], { claimed });
    const counts = await runDailyPush(again.deps);
    expect(counts.already_sent).toBe(1);
    expect(again.sentTo).toEqual([]);
  });

  it("never sends for a title above safety tier none", async () => {
    for (const tier of ["standard", "higher"] as const) {
      const h = harness([target({ safetyTier: tier })]);
      const counts = await runDailyPush(h.deps);
      expect(counts.not_allowed).toBe(1);
      expect(h.sentTo).toEqual([]);
    }
  });

  it("waits for the reader's own day and time", async () => {
    const tuesday = harness([target({ days: [2] })]);
    expect((await runDailyPush(tuesday.deps)).not_due).toBe(1);
    const early = harness([target({ time: "11:00" })]);
    expect((await runDailyPush(early.deps)).not_due).toBe(1);
    expect(early.sentTo).toEqual([]);
  });

  it("stays quiet while the flag is off for the reader", async () => {
    const h = harness([target()], { flag: false });
    expect((await runDailyPush(h.deps)).not_allowed).toBe(1);
    expect(h.sentTo).toEqual([]);
  });

  it("needs a device and a step still to do", async () => {
    expect((await runDailyPush(harness([target()], { subs: {} }).deps)).no_subscription).toBe(1);
    const none = harness([target()], { waiting: false });
    expect((await runDailyPush(none.deps)).nothing_waiting).toBe(1);
    expect(none.sentTo).toEqual([]);
  });

  it("stops by itself after the same number of unanswered nudges as email, emails and pushes together", async () => {
    const h = harness([target({ sentSinceActivity: 2 })], { pushed: 2 });
    const counts = await runDailyPush(h.deps);
    expect(counts.stopped).toBe(1);
    expect(h.sentTo).toEqual([]);
    const ok = harness([target({ sentSinceActivity: 1 })], { pushed: 2 });
    expect((await runDailyPush({ ...ok.deps, stopAfter: 4 })).sent).toBe(1);
  });

  it("sends to every device of the one reader, once, for the programme opened last", async () => {
    const h = harness(
      [target({ enrolmentId: "old", lastOpenedAt: "2026-10-01T10:00:00Z" }), target({ enrolmentId: "new", lastOpenedAt: "2026-10-11T10:00:00Z" })],
      { subs: { u1: [{ id: "a", endpoint: "https://p/a" }, { id: "b", endpoint: "https://p/b" }] } },
    );
    const counts = await runDailyPush(h.deps);
    expect(counts.sent).toBe(1);
    expect(h.sentTo).toEqual(["a", "b"]);
  });

  it("drops a device the push service says is gone, and frees the day when nothing was delivered", async () => {
    const h = harness([target()], { outcome: "gone" });
    const counts = await runDailyPush(h.deps);
    expect(h.removed).toEqual(["s1"]);
    expect(counts.failed).toBe(1);
    expect(h.released).toHaveLength(1);
    const f = harness([target()], { outcome: "failed" });
    await runDailyPush(f.deps);
    expect(f.removed).toEqual([]);
    expect(f.released).toHaveLength(1);
  });

  it("carries on after one reader throws", async () => {
    const h = harness([target({ userId: "u1" }), target({ userId: "u2", enrolmentId: "e2" })], { subs: { u1: [{ id: "s1", endpoint: "https://p/1" }], u2: [{ id: "s2", endpoint: "https://p/2" }] } });
    const real = h.deps.claim;
    h.deps.claim = async (u, d) => {
      if (u === "u1") throw new Error("boom");
      return real(u, d);
    };
    const counts = await runDailyPush(h.deps);
    expect(counts.failed).toBe(1);
    expect(counts.sent).toBe(1);
    expect(h.sentTo).toEqual(["s2"]);
  });
});
