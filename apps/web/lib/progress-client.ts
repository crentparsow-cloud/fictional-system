/**
 * Progress events from the device (F-020), kept until the server has them.
 *
 * Every writer (reading, the daily check, the toolkit) calls recordProgress.
 * The event is queued, posted to /api/progress and, if the network or the
 * server fails, retried after 1s, 4s, 15s and 60s. After that it waits for
 * the device to come back online or the tab to become visible again. A 4xx
 * other than 429 is dropped: the server has refused it for a reason and
 * sending it again will not change that.
 *
 * Pending events live in localStorage under one key, capped at 200 and
 * deduplicated by enrolment, kind and ref. Every storage call is wrapped, so
 * a browser with storage blocked simply keeps the queue in memory. Events
 * hold ids only: an enrolment id, a kind, a ref and, for a step, the unit
 * number. No answer, no feeling, no date.
 *
 * Nothing here counts days, streaks or goals, and nothing derives them (F-018).
 * The server stores a one-off fact once (0071) and answers a repeat with
 * success, so a retry after a lost response is safe.
 *
 * Posts use fetch with keepalive, so one sent as the tab closes still goes.
 * On pagehide every pending event is sent at once without waiting and is
 * taken out of storage first, so a reload cannot send a repeating kind
 * (toolkit_used) twice. If the page stays and the send fails, it goes back.
 */

export type ProgressKind = "unit_opened" | "step_done" | "checkin_done" | "daily_check_done" | "toolkit_used" | "finished";

export interface ProgressInput {
  enrolmentId: string;
  kind: ProgressKind;
  ref?: string;
  /** The unit a step was done in, for the per-unit count only (0036). */
  unit?: number;
}

export const QUEUE_KEY = "akana.progress.queue.v1";
export const MAX_PENDING = 200;
export const BACKOFF_MS: readonly number[] = [1000, 4000, 15000, 60000];

const KINDS: readonly string[] = ["unit_opened", "step_done", "checkin_done", "daily_check_done", "toolkit_used", "finished"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REF = /^[a-z0-9][a-z0-9_:~.-]{0,79}$/;

export const eventKey = (e: Pick<ProgressInput, "enrolmentId" | "kind" | "ref">) => `${e.enrolmentId}|${e.kind}|${e.ref ?? ""}`;

/** Accepts only well-formed events from storage; anything else is ignored. */
export function parseStored(raw: string | null): ProgressInput[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const seen = new Set<string>();
  const out: ProgressInput[] = [];
  for (const x of data) {
    const o = x as Partial<ProgressInput> | null;
    if (!o || typeof o !== "object") continue;
    if (typeof o.enrolmentId !== "string" || !UUID.test(o.enrolmentId)) continue;
    if (typeof o.kind !== "string" || !KINDS.includes(o.kind)) continue;
    if (o.ref !== undefined && (typeof o.ref !== "string" || !REF.test(o.ref))) continue;
    if (o.unit !== undefined && (!Number.isInteger(o.unit) || o.unit < 1 || o.unit > 999)) continue;
    const ev: ProgressInput = { enrolmentId: o.enrolmentId, kind: o.kind as ProgressKind };
    if (o.ref !== undefined) ev.ref = o.ref;
    if (o.unit !== undefined) ev.unit = o.unit;
    const k = eventKey(ev);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(ev);
  }
  return out.slice(-MAX_PENDING);
}

type Timer = ReturnType<typeof setTimeout>;

interface Item {
  event: ProgressInput;
  attempts: number;
  timer: Timer | null;
  parked: boolean;
  sending: boolean;
  /** Sent as the tab closed: kept out of storage so a reload cannot send it twice. */
  handedOff: boolean;
}

export interface QueueDeps {
  fetch: (input: string, init: RequestInit) => Promise<{ ok: boolean; status: number }>;
  /** Null when the browser has no usable storage. */
  storage: () => Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  setTimeout: (fn: () => void, ms: number) => Timer;
  clearTimeout: (t: Timer) => void;
  endpoint?: string;
}

export interface ProgressQueue {
  record(input: ProgressInput): void;
  /** Send everything that is not waiting on a timer. Resolves when the pass ends. */
  flush(): Promise<void>;
  /** The device is back or the tab is visible: reset the backoff and send all. */
  resume(): Promise<void>;
  /** The tab is closing: send every pending event at once and do not wait. */
  sendAllNow(): void;
  pending(): ProgressInput[];
}

export function createProgressQueue(deps: QueueDeps): ProgressQueue {
  const endpoint = deps.endpoint ?? "/api/progress";
  let items: Item[] = [];
  let flushing: Promise<void> | null = null;
  let again = false;

  const store = () => {
    try {
      return deps.storage();
    } catch {
      return null;
    }
  };
  const persist = () => {
    const s = store();
    if (!s) return;
    try {
      const keep = items.filter((i) => !i.handedOff);
      if (keep.length === 0) s.removeItem(QUEUE_KEY);
      else s.setItem(QUEUE_KEY, JSON.stringify(keep.map((i) => i.event)));
    } catch {
      // Full or blocked: the queue carries on in memory.
    }
  };

  const add = (event: ProgressInput) => {
    if (items.some((i) => eventKey(i.event) === eventKey(event))) return;
    items.push({ event, attempts: 0, timer: null, parked: false, sending: false, handedOff: false });
    if (items.length > MAX_PENDING) {
      for (const dropped of items.slice(0, items.length - MAX_PENDING)) if (dropped.timer) deps.clearTimeout(dropped.timer);
      items = items.slice(-MAX_PENDING);
    }
  };

  // Load what an earlier page left behind.
  try {
    const s = store();
    for (const e of parseStored(s ? s.getItem(QUEUE_KEY) : null)) add(e);
  } catch {
    // Nothing to load.
  }

  const remove = (item: Item) => {
    if (item.timer) deps.clearTimeout(item.timer);
    items = items.filter((i) => i !== item);
    persist();
  };

  const body = (e: ProgressInput) => {
    const b: Record<string, unknown> = { enrolment: e.enrolmentId, kind: e.kind };
    if (e.ref !== undefined) b.ref = e.ref;
    if (e.unit !== undefined) b.unit = e.unit;
    return JSON.stringify(b);
  };

  async function sendOne(item: Item): Promise<void> {
    if (item.sending) return;
    item.sending = true;
    let outcome: "done" | "drop" | "retry";
    try {
      const res = await deps.fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: body(item.event),
        keepalive: true,
      });
      if (res.ok) outcome = "done";
      else if (res.status === 429 || res.status >= 500) outcome = "retry";
      else outcome = "drop";
    } catch {
      outcome = "retry";
    }
    item.sending = false;
    const wasHandedOff = item.handedOff;
    item.handedOff = false;
    if (outcome !== "retry") {
      remove(item);
      return;
    }
    // The page is still here and the send failed: put it back in storage.
    if (wasHandedOff) persist();
    item.attempts += 1;
    if (item.attempts <= BACKOFF_MS.length) {
      item.timer = deps.setTimeout(() => {
        item.timer = null;
        void flush();
      }, BACKOFF_MS[item.attempts - 1]!);
    } else {
      item.parked = true;
    }
  }

  function flush(): Promise<void> {
    if (flushing) {
      again = true;
      return flushing;
    }
    flushing = (async () => {
      try {
        do {
          again = false;
          for (const item of [...items]) {
            if (item.timer || item.parked || item.sending) continue;
            await sendOne(item);
          }
        } while (again);
      } finally {
        flushing = null;
      }
    })();
    return flushing;
  }

  return {
    record(input) {
      add({ ...input });
      persist();
      void flush();
    },
    flush,
    resume() {
      for (const item of items) {
        if (item.timer) deps.clearTimeout(item.timer);
        item.timer = null;
        item.parked = false;
        item.attempts = 0;
      }
      return flush();
    },
    sendAllNow() {
      for (const item of [...items]) {
        if (item.timer) deps.clearTimeout(item.timer);
        item.timer = null;
        if (item.sending) continue;
        item.handedOff = true;
        void sendOne(item);
      }
      // Out of storage before the attempt: if the page goes, a reload will not resend them.
      persist();
    },
    pending: () => items.map((i) => ({ ...i.event })),
  };
}

let shared: ProgressQueue | null = null;

function browserQueue(): ProgressQueue {
  if (shared) return shared;
  const q = createProgressQueue({
    fetch: (input, init) => fetch(input, init),
    storage: () => {
      try {
        return typeof localStorage === "undefined" ? null : localStorage;
      } catch {
        return null;
      }
    },
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (t) => clearTimeout(t),
  });
  shared = q;
  if (typeof window !== "undefined") {
    window.addEventListener("online", () => void q.resume());
    window.addEventListener("pagehide", () => q.sendAllNow());
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") void q.resume();
      });
    }
    void q.flush();
  }
  return q;
}

/** Queue one progress event and send it, retrying until the server has it. Safe to call anywhere on the client. */
export function recordProgress(input: ProgressInput): void {
  try {
    browserQueue().record(input);
  } catch {
    // Progress is never worth breaking the page for.
  }
}

/** Start the queue early so events left by an earlier page are sent on load. */
export function startProgressQueue(): void {
  try {
    browserQueue();
  } catch {
    // As above.
  }
}

/** Test hook: forget the shared queue. */
export function resetProgressQueueForTests(): void {
  shared = null;
}
