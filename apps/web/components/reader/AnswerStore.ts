import type { AnswerStore, FieldValue } from "@akana/engine";
import { fieldKey, splitFieldKey } from "@/lib/answer-fields";

/**
 * The engine's AnswerStore over the sealed answers route.
 *
 * Reads are synchronous from an in-memory map seeded by GET /api/answers.
 * Writes update the map at once, then autosave to PUT /api/answers after a
 * short debounce per field. A failed save retries with backoff and keeps the
 * reader's value in memory, so nothing typed is lost while the network is
 * away. Last write wins: a field changed again while a save is in flight is
 * sent again once that save settles.
 *
 * The store never sees plaintext leave the device unsealed except over this
 * one route, and never sees a key. Sealing is the server's job.
 */

/** failed: the server refused the value (a 4xx), so no retry will help. */
export type SaveState = "idle" | "saving" | "saved" | "retrying" | "failed";

export interface SupabaseAnswerStoreOptions {
  enrolmentId: string;
  initial?: Record<string, unknown>;
  onStatus?: (state: SaveState) => void;
  fetch?: typeof fetch;
  debounceMs?: number;
  /** Backoff after a failed save, in ms, by attempt. The last entry repeats. */
  retryDelaysMs?: readonly number[];
  endpoint?: string;
}

interface Pending {
  timer: ReturnType<typeof setTimeout> | null;
  attempt: number;
  inFlight: boolean;
  dirty: boolean;
}

const DEFAULT_RETRY = [1_000, 2_000, 5_000, 10_000, 30_000] as const;

export class SupabaseAnswerStore implements AnswerStore {
  private readonly values = new Map<string, FieldValue>();
  private readonly pending = new Map<string, Pending>();
  private readonly enrolmentId: string;
  private readonly onStatus: (state: SaveState) => void;
  private readonly fetchFn: typeof fetch;
  private readonly debounceMs: number;
  private readonly retryDelays: readonly number[];
  private readonly endpoint: string;
  private state: SaveState = "idle";

  constructor(opts: SupabaseAnswerStoreOptions) {
    this.enrolmentId = opts.enrolmentId;
    this.onStatus = opts.onStatus ?? (() => undefined);
    this.fetchFn = opts.fetch ?? ((input, init) => fetch(input, init));
    this.debounceMs = opts.debounceMs ?? 600;
    this.retryDelays = opts.retryDelaysMs ?? DEFAULT_RETRY;
    this.endpoint = opts.endpoint ?? "/api/answers";
    for (const [field, value] of Object.entries(opts.initial ?? {})) {
      this.values.set(field, value as FieldValue);
    }
  }

  /** Fetch the reader's answers for an enrolment and build a store from them. */
  static async load(opts: SupabaseAnswerStoreOptions): Promise<SupabaseAnswerStore> {
    const fetchFn = opts.fetch ?? ((input, init) => fetch(input, init));
    const endpoint = opts.endpoint ?? "/api/answers";
    const res = await fetchFn(`${endpoint}?enrolment=${encodeURIComponent(opts.enrolmentId)}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`answers_load_${res.status}`);
    const body = (await res.json()) as { answers?: Record<string, unknown> };
    return new SupabaseAnswerStore({ ...opts, initial: body.answers ?? {} });
  }

  get(scope: string, fieldId: string): FieldValue | undefined {
    return this.values.get(fieldKey(scope, fieldId));
  }

  set(scope: string, fieldId: string, value: FieldValue): void {
    const field = fieldKey(scope, fieldId);
    this.values.set(field, value);
    this.schedule(field, this.debounceMs);
  }

  /** Current state, for a component mounting after the first change. */
  get status(): SaveState {
    return this.state;
  }

  /** Fields with a save still owed. */
  get pendingCount(): number {
    return this.pending.size;
  }

  /** Send everything owed now. Used on page hide. */
  flush(): void {
    for (const [field, p] of this.pending) {
      if (p.timer) {
        clearTimeout(p.timer);
        p.timer = null;
      }
      if (!p.inFlight) void this.save(field);
    }
  }

  /** Everything held, as (scope, fieldId, value), for tests. */
  entries(): Array<[string, string, FieldValue]> {
    const out: Array<[string, string, FieldValue]> = [];
    for (const [field, value] of this.values) {
      const parts = splitFieldKey(field);
      if (parts) out.push([parts.scope, parts.fieldId, value]);
    }
    return out;
  }

  private schedule(field: string, delay: number): void {
    const p = this.pending.get(field) ?? { timer: null, attempt: 0, inFlight: false, dirty: false };
    p.dirty = true;
    if (p.inFlight) {
      // Sent again after the current save settles.
      this.pending.set(field, p);
      return;
    }
    if (p.timer) clearTimeout(p.timer);
    p.timer = setTimeout(() => void this.save(field), delay);
    this.pending.set(field, p);
    this.setState(p.attempt > 0 ? "retrying" : "saving");
  }

  private async save(field: string): Promise<void> {
    const p = this.pending.get(field);
    if (!p || p.inFlight) return;
    p.timer = null;
    p.inFlight = true;
    p.dirty = false;
    const value = this.values.get(field);
    this.setState(p.attempt > 0 ? "retrying" : "saving");

    let ok = false;
    try {
      const res = await this.fetchFn(this.endpoint, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enrolment: this.enrolmentId, field, value: value ?? null }),
        keepalive: true,
      });
      // 4xx other than 429 will not get better by retrying; drop the save
      // and let the status show it could not be kept.
      ok = res.ok;
      if (!ok && res.status >= 400 && res.status < 500 && res.status !== 429 && res.status !== 408) {
        p.inFlight = false;
        this.pending.delete(field);
        this.setState("failed");
        return;
      }
    } catch {
      ok = false;
    }
    p.inFlight = false;

    if (ok) {
      p.attempt = 0;
      if (p.dirty) {
        this.schedule(field, this.debounceMs);
      } else {
        this.pending.delete(field);
        if (this.pending.size === 0) this.setState("saved");
      }
      return;
    }

    const delay = this.retryDelays[Math.min(p.attempt, this.retryDelays.length - 1)] ?? 30_000;
    p.attempt += 1;
    p.dirty = true;
    p.timer = setTimeout(() => void this.save(field), delay);
    this.pending.set(field, p);
    this.setState("retrying");
  }

  private setState(next: SaveState): void {
    if (this.state === next) return;
    this.state = next;
    this.onStatus(next);
  }
}
