import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SupabaseAnswerStore, type SaveState } from "./AnswerStore";

type Call = { url: string; body: unknown };

function fakeFetch(plan: Array<number | "network">) {
  const calls: Call[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body });
    const next = plan.length > 1 ? plan.shift()! : plan[0]!;
    if (next === "network") throw new TypeError("Failed to fetch");
    return new Response(JSON.stringify(next === 200 ? { updated_at: "now" } : { error: "x" }), { status: next });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

const flushMicrotasks = async () => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

describe("SupabaseAnswerStore", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("seeds from initial values and reads synchronously", () => {
    const store = new SupabaseAnswerStore({ enrolmentId: "e1", initial: { "exercise:ex_one.f_one": "hello", "checkin:3.mood": 7 }, fetch: fakeFetch([200]).fn });
    expect(store.get("ex_one", "f_one")).toBe("hello");
    expect(store.get("checkin:3", "mood")).toBe(7);
    expect(store.get("ex_one", "missing")).toBeUndefined();
  });

  it("debounces writes per field and sends the last value", async () => {
    const { fn, calls } = fakeFetch([200]);
    const states: SaveState[] = [];
    const store = new SupabaseAnswerStore({ enrolmentId: "e1", fetch: fn, onStatus: (s) => states.push(s) });
    store.set("ex_one", "f_one", "h");
    store.set("ex_one", "f_one", "he");
    store.set("ex_one", "f_one", "hel");
    store.set("checkin:1", "mood", 4);
    expect(calls).toHaveLength(0);
    expect(states).toEqual(["saving"]);

    await vi.advanceTimersByTimeAsync(599);
    expect(calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    await flushMicrotasks();
    expect(calls).toHaveLength(2);
    expect(calls[0]!.body).toEqual({ enrolment: "e1", field: "exercise:ex_one.f_one", value: "hel" });
    expect(calls[1]!.body).toEqual({ enrolment: "e1", field: "checkin:1.mood", value: 4 });
    expect(states.at(-1)).toBe("saved");
    expect(store.pendingCount).toBe(0);
  });

  it("retries with backoff and keeps the value", async () => {
    const { fn, calls } = fakeFetch(["network", 500, 200]);
    const states: SaveState[] = [];
    const store = new SupabaseAnswerStore({ enrolmentId: "e1", fetch: fn, onStatus: (s) => states.push(s), retryDelaysMs: [1000, 2000] });
    store.set("ex_one", "f_one", "keep me");

    await vi.advanceTimersByTimeAsync(600);
    await flushMicrotasks();
    expect(calls).toHaveLength(1);
    expect(states.at(-1)).toBe("retrying");
    expect(store.get("ex_one", "f_one")).toBe("keep me");

    await vi.advanceTimersByTimeAsync(999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await flushMicrotasks();
    expect(calls).toHaveLength(2);
    expect(states.at(-1)).toBe("retrying");

    await vi.advanceTimersByTimeAsync(2000);
    await flushMicrotasks();
    expect(calls).toHaveLength(3);
    expect(states.at(-1)).toBe("saved");
    expect(store.pendingCount).toBe(0);
  });

  it("sends again after an in-flight save when the field changed meanwhile (last write wins)", async () => {
    let release: (() => void) | null = null;
    const calls: Call[] = [];
    const slow = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: "", body: JSON.parse(String(init?.body)) });
      if (calls.length === 1) await new Promise<void>((r) => (release = r));
      return new Response(JSON.stringify({ updated_at: "now" }), { status: 200 });
    }) as unknown as typeof fetch;
    const store = new SupabaseAnswerStore({ enrolmentId: "e1", fetch: slow });
    store.set("ex_one", "f_one", "first");
    await vi.advanceTimersByTimeAsync(600);
    expect(calls).toHaveLength(1);

    store.set("ex_one", "f_one", "second");
    await vi.advanceTimersByTimeAsync(600);
    expect(calls).toHaveLength(1); // still waiting on the first

    release!();
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(600);
    await flushMicrotasks();
    expect(calls).toHaveLength(2);
    expect((calls[1]!.body as { value: string }).value).toBe("second");
    expect(store.status).toBe("saved");
  });

  it("stops retrying on a refused value and reports failed", async () => {
    const { fn, calls } = fakeFetch([413]);
    const states: SaveState[] = [];
    const store = new SupabaseAnswerStore({ enrolmentId: "e1", fetch: fn, onStatus: (s) => states.push(s) });
    store.set("ex_one", "f_one", "x".repeat(10));
    await vi.advanceTimersByTimeAsync(600);
    await flushMicrotasks();
    expect(calls).toHaveLength(1);
    expect(states.at(-1)).toBe("failed");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toHaveLength(1);
  });

  it("flush sends pending fields at once", async () => {
    const { fn, calls } = fakeFetch([200]);
    const store = new SupabaseAnswerStore({ enrolmentId: "e1", fetch: fn });
    store.set("ex_one", "f_one", "a");
    store.flush();
    await flushMicrotasks();
    expect(calls).toHaveLength(1);
  });

  it("load seeds from GET", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ answers: { "start.why": "because" } }), { status: 200 })) as unknown as typeof fetch;
    const store = await SupabaseAnswerStore.load({ enrolmentId: "e1", fetch: fetchFn });
    expect(store.get("start", "why")).toBe("because");
    expect(String((fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0])).toBe("/api/answers?enrolment=e1");
  });
  it("reports each confirmed save by field key only (hardest answer card hook)", async () => {
    const saved: unknown[][] = [];
    const store = new SupabaseAnswerStore({ enrolmentId: "e1", fetch: fakeFetch([200]).fn, onSaved: (...a) => saved.push(a) });
    store.set("ex_one", "f_one", "private words");
    await vi.advanceTimersByTimeAsync(600);
    await flushMicrotasks();
    expect(saved).toEqual([["exercise:ex_one.f_one"]]);
  });

  it("shows the consent state when the route refuses for missing consent", async () => {
    const states: SaveState[] = [];
    const fn = vi.fn(async () => new Response(JSON.stringify({ error: "consent_required", message: "m" }), { status: 403 }));
    const saved: string[] = [];
    const store = new SupabaseAnswerStore({ enrolmentId: "e1", fetch: fn as unknown as typeof fetch, onStatus: (s) => states.push(s), onSaved: (f) => saved.push(f) });
    store.set("ex_one", "f_one", "x");
    await vi.advanceTimersByTimeAsync(600);
    await flushMicrotasks();
    expect(states.at(-1)).toBe("consent");
    expect(saved).toEqual([]);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
