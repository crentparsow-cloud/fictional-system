import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DraftStore, MemoryDraftBackend } from "@/lib/draft-store";
import { DeviceAnswerStore, SupabaseAnswerStore, type SaveState } from "./AnswerStore";

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

  it("shows the read only state while a deletion is pending, and does not retry", async () => {
    const states: SaveState[] = [];
    const fn = vi.fn(async () => new Response(JSON.stringify({ error: "read_only", message: "m" }), { status: 403 }));
    const store = new SupabaseAnswerStore({ enrolmentId: "e1", fetch: fn as unknown as typeof fetch, onStatus: (s) => states.push(s) });
    store.set("ex_one", "f_one", "x");
    await vi.advanceTimersByTimeAsync(600);
    await flushMicrotasks();
    expect(states.at(-1)).toBe("read_only");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("offline draft recovery (14.6)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("keeps each change as a device draft and deletes it once the server confirms", async () => {
    const { fn } = fakeFetch([200]);
    const backend = new MemoryDraftBackend();
    const drafts = new DraftStore(backend);
    const store = new SupabaseAnswerStore({ enrolmentId: "e1", fetch: fn, drafts, draftBucket: "enrolment:e1" });
    store.set("ex_one", "f_one", "hello");
    await flushMicrotasks();
    expect(backend.buckets.get("enrolment:e1")?.get("exercise:ex_one.f_one")?.value).toBe("hello");
    await vi.advanceTimersByTimeAsync(700);
    await flushMicrotasks();
    expect(backend.buckets.get("enrolment:e1")?.size ?? 0).toBe(0);
  });

  it("keeps the draft while the network is away, and sends it on the next load", async () => {
    const backend = new MemoryDraftBackend();
    const drafts = new DraftStore(backend);
    const away = fakeFetch(["network"]);
    const first = new SupabaseAnswerStore({ enrolmentId: "e1", fetch: away.fn, drafts, draftBucket: "enrolment:e1" });
    first.set("ex_one", "f_one", "typed offline");
    await vi.advanceTimersByTimeAsync(700);
    await flushMicrotasks();
    expect(backend.buckets.get("enrolment:e1")?.get("exercise:ex_one.f_one")?.value).toBe("typed offline");

    // The tab is gone. A new load finds the draft and sends it.
    const back = fakeFetch([200]);
    let recovered = 0;
    const second = new SupabaseAnswerStore({ enrolmentId: "e1", fetch: back.fn, drafts, draftBucket: "enrolment:e1", onRecovered: (n) => (recovered = n) });
    expect(await second.recover()).toBe(1);
    expect(recovered).toBe(1);
    expect(second.get("ex_one", "f_one")).toBe("typed offline");
    await vi.advanceTimersByTimeAsync(10);
    await flushMicrotasks();
    expect(back.calls[0]?.body).toMatchObject({ enrolment: "e1", field: "exercise:ex_one.f_one", value: "typed offline" });
    await flushMicrotasks();
    expect(backend.buckets.get("enrolment:e1")?.size ?? 0).toBe(0);
  });

  it("drops a draft the server already holds with the same value", async () => {
    const backend = new MemoryDraftBackend();
    const drafts = new DraftStore(backend);
    await drafts.put("enrolment:e1", "exercise:ex_one.f_one", "same");
    const { fn, calls } = fakeFetch([200]);
    const store = new SupabaseAnswerStore({ enrolmentId: "e1", initial: { "exercise:ex_one.f_one": "same" }, fetch: fn, drafts, draftBucket: "enrolment:e1" });
    expect(await store.recover()).toBe(0);
    expect(calls).toHaveLength(0);
    expect(backend.buckets.get("enrolment:e1")?.size ?? 0).toBe(0);
  });

  it("keeps the draft when the server refuses for consent, and drops it for a plain refusal", async () => {
    const backend = new MemoryDraftBackend();
    const drafts = new DraftStore(backend);
    const consent = vi.fn(async () => new Response(JSON.stringify({ error: "consent_required" }), { status: 403 }));
    const store = new SupabaseAnswerStore({ enrolmentId: "e1", fetch: consent as unknown as typeof fetch, drafts, draftBucket: "enrolment:e1" });
    store.set("ex_one", "f_one", "x");
    await vi.advanceTimersByTimeAsync(700);
    await flushMicrotasks();
    expect(store.status).toBe("consent");
    expect(backend.buckets.get("enrolment:e1")?.size).toBe(1);

    const bad = vi.fn(async () => new Response(JSON.stringify({ error: "x" }), { status: 400 }));
    const store2 = new SupabaseAnswerStore({ enrolmentId: "e2", fetch: bad as unknown as typeof fetch, drafts, draftBucket: "enrolment:e2" });
    store2.set("ex_one", "f_one", "y");
    await vi.advanceTimersByTimeAsync(700);
    await flushMicrotasks();
    expect(store2.status).toBe("failed");
    expect(backend.buckets.get("enrolment:e2")?.size ?? 0).toBe(0);
  });

  it("carries on, and says so, when the device is full", async () => {
    const backend = new MemoryDraftBackend();
    backend.failWith = Object.assign(new Error("full"), { name: "QuotaExceededError" });
    const issues: string[] = [];
    const { fn, calls } = fakeFetch([200]);
    const store = new SupabaseAnswerStore({ enrolmentId: "e1", fetch: fn, drafts: new DraftStore(backend), draftBucket: "enrolment:e1", onDraftIssue: (i) => issues.push(i) });
    store.set("ex_one", "f_one", "still saved to the server");
    await flushMicrotasks();
    expect(issues).toEqual(["quota"]);
    await vi.advanceTimersByTimeAsync(700);
    await flushMicrotasks();
    expect(calls).toHaveLength(1);
    expect(store.get("ex_one", "f_one")).toBe("still saved to the server");
  });

  it("works exactly as before with no drafts", async () => {
    const { fn, calls } = fakeFetch([200]);
    const store = new SupabaseAnswerStore({ enrolmentId: "e1", fetch: fn });
    store.set("ex_one", "f_one", "plain");
    await vi.advanceTimersByTimeAsync(700);
    expect(calls).toHaveLength(1);
    expect(await store.recover()).toBe(0);
  });
});

describe("DeviceAnswerStore (5.2)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("holds answers on the device only and never calls the network", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const backend = new MemoryDraftBackend();
    const states: SaveState[] = [];
    const store = new DeviceAnswerStore(new DraftStore(backend), "try:focus-week", (s) => states.push(s));
    store.set("ex_one", "f_one", "a visitor's words");
    expect(store.get("ex_one", "f_one")).toBe("a visitor's words");
    await vi.advanceTimersByTimeAsync(400);
    await flushMicrotasks();
    expect(backend.buckets.get("try:focus-week")?.get("exercise:ex_one.f_one")?.value).toBe("a visitor's words");
    expect(states).toEqual(["device"]);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("reloads what was kept, even in a later visit", async () => {
    const backend = new MemoryDraftBackend();
    const drafts = new DraftStore(backend);
    await drafts.put("try:focus-week", "exercise:ex_one.f_one", "kept");
    await drafts.put("try:focus-week", "checkin:1.mood", 4);
    await drafts.put("try:focus-week", "not a field path", "ignored");
    const store = await DeviceAnswerStore.load(drafts, "try:focus-week");
    expect(store.get("ex_one", "f_one")).toBe("kept");
    expect(store.get("checkin:1", "mood")).toBe(4);
    expect(store.size).toBe(2);
    expect(store.status).toBe("device");
  });

  it("keeps a bucket per workbook", async () => {
    const backend = new MemoryDraftBackend();
    const drafts = new DraftStore(backend);
    const a = new DeviceAnswerStore(drafts, "try:a", undefined, 0);
    const b = new DeviceAnswerStore(drafts, "try:b", undefined, 0);
    a.set("ex_one", "f_one", "A");
    b.set("ex_one", "f_one", "B");
    await vi.advanceTimersByTimeAsync(5);
    await flushMicrotasks();
    expect(backend.buckets.get("try:a")?.get("exercise:ex_one.f_one")?.value).toBe("A");
    expect(backend.buckets.get("try:b")?.get("exercise:ex_one.f_one")?.value).toBe("B");
  });

  it("says the device is full when a write hits the quota, and keeps the answer in memory", async () => {
    const backend = new MemoryDraftBackend();
    backend.failWith = Object.assign(new Error("full"), { name: "QuotaExceededError" });
    const states: SaveState[] = [];
    const store = new DeviceAnswerStore(new DraftStore(backend), "try:a", (s) => states.push(s), 0);
    store.set("ex_one", "f_one", "words");
    await vi.advanceTimersByTimeAsync(5);
    await flushMicrotasks();
    expect(states).toEqual(["device_full"]);
    expect(store.get("ex_one", "f_one")).toBe("words");
  });

  it("flush writes what is owed at once", async () => {
    const backend = new MemoryDraftBackend();
    const store = new DeviceAnswerStore(new DraftStore(backend), "try:a");
    store.set("ex_one", "f_one", "now");
    store.flush();
    await flushMicrotasks();
    expect(backend.buckets.get("try:a")?.size).toBe(1);
  });
});
