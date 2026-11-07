import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BACKOFF_MS, MAX_PENDING, QUEUE_KEY, createProgressQueue, parseStored, type QueueDeps } from "./progress-client";

const E1 = "a7100000-0000-4000-8000-0000000000e1";
const E2 = "a7100000-0000-4000-8000-0000000000e2";

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

function make(responses: Array<number | "throw">, storage: QueueDeps["storage"] | null = null) {
  const calls: Array<{ body: Record<string, unknown>; keepalive?: boolean }> = [];
  const queue = [...responses];
  const mem = memoryStorage();
  const q = createProgressQueue({
    fetch: async (_url, init) => {
      calls.push({ body: JSON.parse(String(init.body)), keepalive: init.keepalive });
      const r = queue.length > 1 ? queue.shift()! : queue[0]!;
      if (r === "throw") throw new TypeError("network");
      return { ok: r >= 200 && r < 300, status: r };
    },
    storage: storage ?? (() => mem),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (t) => clearTimeout(t),
  });
  return { q, calls, mem };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("progress queue", () => {
  it("sends once and clears the queue on success", async () => {
    const { q, calls, mem } = make([200]);
    q.record({ enrolmentId: E1, kind: "step_done", ref: "s1", unit: 2 });
    expect(mem.m.get(QUEUE_KEY)).toContain("s1");
    await q.flush();
    expect(calls).toEqual([{ body: { enrolment: E1, kind: "step_done", ref: "s1", unit: 2 }, keepalive: true }]);
    expect(q.pending()).toEqual([]);
    expect(mem.m.has(QUEUE_KEY)).toBe(false);
  });

  it("retries after one failure and then succeeds", async () => {
    const { q, calls } = make([500, 200]);
    q.record({ enrolmentId: E1, kind: "unit_opened", ref: "1" });
    await q.flush();
    expect(calls).toHaveLength(1);
    expect(q.pending()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(BACKOFF_MS[0]!);
    expect(calls).toHaveLength(2);
    expect(q.pending()).toHaveLength(0);
  });

  it("follows the backoff, then waits for resume", async () => {
    const { q, calls } = make(["throw"]);
    q.record({ enrolmentId: E1, kind: "finished" });
    await q.flush();
    for (const ms of BACKOFF_MS) await vi.advanceTimersByTimeAsync(ms);
    expect(calls).toHaveLength(1 + BACKOFF_MS.length);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(calls).toHaveLength(1 + BACKOFF_MS.length);
    expect(q.pending()).toHaveLength(1);
    await q.resume();
    expect(calls).toHaveLength(2 + BACKOFF_MS.length);
  });

  it("retries a 429 but drops other 4xx", async () => {
    const a = make([429, 200]);
    a.q.record({ enrolmentId: E1, kind: "step_done", ref: "s1" });
    await a.q.flush();
    expect(a.q.pending()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(BACKOFF_MS[0]!);
    expect(a.q.pending()).toHaveLength(0);

    const b = make([400]);
    b.q.record({ enrolmentId: E1, kind: "step_done", ref: "s1" });
    await b.q.flush();
    expect(b.calls).toHaveLength(1);
    expect(b.q.pending()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(b.calls).toHaveLength(1);
  });

  it("deduplicates by enrolment, kind and ref", async () => {
    const { q, calls } = make([500]);
    q.record({ enrolmentId: E1, kind: "step_done", ref: "s1" });
    q.record({ enrolmentId: E1, kind: "step_done", ref: "s1" });
    q.record({ enrolmentId: E1, kind: "step_done", ref: "s2" });
    q.record({ enrolmentId: E2, kind: "step_done", ref: "s1" });
    await q.flush();
    expect(q.pending()).toHaveLength(3);
    expect(calls).toHaveLength(3);
  });

  it("caps pending events at the limit, dropping the oldest", () => {
    const { q } = make([500]);
    for (let i = 0; i < MAX_PENDING + 20; i++) q.record({ enrolmentId: E1, kind: "toolkit_used", ref: `t${i}` });
    const p = q.pending();
    expect(p).toHaveLength(MAX_PENDING);
    expect(p[0]!.ref).toBe("t20");
  });

  it("works with no storage at all", async () => {
    const { q, calls } = make([200], () => null);
    q.record({ enrolmentId: E1, kind: "daily_check_done" });
    await q.flush();
    expect(calls).toHaveLength(1);
    expect(q.pending()).toHaveLength(0);
  });

  it("survives storage that throws", async () => {
    const bad = () => {
      throw new Error("blocked");
    };
    const { q, calls } = make([200], bad as unknown as QueueDeps["storage"]);
    q.record({ enrolmentId: E1, kind: "finished" });
    await q.flush();
    expect(calls).toHaveLength(1);
  });

  it("loads events left by an earlier page and sends them on flush", async () => {
    const mem = memoryStorage();
    mem.m.set(QUEUE_KEY, JSON.stringify([{ enrolmentId: E1, kind: "step_done", ref: "s9" }]));
    const calls: unknown[] = [];
    const q = createProgressQueue({
      fetch: async (_u, init) => {
        calls.push(JSON.parse(String(init.body)));
        return { ok: true, status: 200 };
      },
      storage: () => mem,
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (t) => clearTimeout(t),
    });
    expect(q.pending()).toHaveLength(1);
    await q.flush();
    expect(calls).toEqual([{ enrolment: E1, kind: "step_done", ref: "s9" }]);
  });

  it("sendAllNow posts everything without waiting for a timer", async () => {
    const { q, calls } = make([500, 200]);
    q.record({ enrolmentId: E1, kind: "step_done", ref: "s1" });
    await q.flush();
    expect(calls).toHaveLength(1);
    q.sendAllNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(2);
  });

  it("takes events out of storage when handed off on pagehide, and puts them back if the send fails", async () => {
    const { q, mem } = make([500]);
    q.record({ enrolmentId: E1, kind: "toolkit_used", ref: "t1" });
    await q.flush();
    expect(mem.m.has(QUEUE_KEY)).toBe(true);
    q.sendAllNow();
    expect(mem.m.has(QUEUE_KEY)).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(mem.m.get(QUEUE_KEY)).toContain("t1");
  });

  it("does not leave a handed-off event in storage after a successful send", async () => {
    const { q, mem } = make([200]);
    q.record({ enrolmentId: E1, kind: "toolkit_used", ref: "t1" });
    q.sendAllNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(mem.m.has(QUEUE_KEY)).toBe(false);
    expect(q.pending()).toHaveLength(0);
  });
});

describe("parseStored", () => {
  it("ignores bad JSON, bad shapes and duplicates", () => {
    expect(parseStored(null)).toEqual([]);
    expect(parseStored("{")).toEqual([]);
    expect(parseStored("{}")).toEqual([]);
    const raw = JSON.stringify([
      { enrolmentId: E1, kind: "step_done", ref: "s1" },
      { enrolmentId: E1, kind: "step_done", ref: "s1" },
      { enrolmentId: "nope", kind: "step_done" },
      { enrolmentId: E1, kind: "other" },
      { enrolmentId: E1, kind: "step_done", ref: "Bad Ref" },
      { enrolmentId: E1, kind: "step_done", ref: "s2", unit: 0 },
      null,
    ]);
    expect(parseStored(raw)).toEqual([{ enrolmentId: E1, kind: "step_done", ref: "s1" }]);
  });
});
