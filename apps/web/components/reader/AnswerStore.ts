import type { AnswerStore, FieldValue } from "@akana/engine";
import { fieldKey, splitFieldKey } from "@/lib/answer-fields";
import type { DraftStore, DraftWrite } from "@/lib/draft-store";

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
 *
 * Offline draft recovery (14.6): with a DraftStore, every change is also
 * written to IndexedDB on the device, in a bucket for this enrolment, and
 * deleted again once the server confirms that save. If the tab closes or the
 * connection drops with a save still owed, the next load finds the drafts and
 * sends them. Once an answer is on the server it is the server's sealed copy
 * and no plaintext is left on the device. The device write never blocks the
 * save and never throws; a full or blocked disk is reported to onDraftIssue
 * and the reader's typing carries on in memory as before.
 *
 * DeviceAnswerStore, below, is the same store with no server: it is what a
 * visitor with no account writes into while trying the first unit (5.2).
 */

/**
 * failed: the server refused the value (a 4xx), so no retry will help.
 * consent: refused because health data consent is not in place (F-026).
 * read_only: refused because an account deletion is pending (F-025).
 */
export type SaveState = "idle" | "saving" | "saved" | "retrying" | "failed" | "consent" | "read_only" | "device" | "device_full";

export interface SupabaseAnswerStoreOptions {
  enrolmentId: string;
  initial?: Record<string, unknown>;
  onStatus?: (state: SaveState) => void;
  fetch?: typeof fetch;
  debounceMs?: number;
  /** Backoff after a failed save, in ms, by attempt. The last entry repeats. */
  retryDelaysMs?: readonly number[];
  endpoint?: string;
  /** Called with the field key after the server confirms a save. Never with the value. */
  onSaved?: (field: string) => void;
  /**
   * The unit the reader is in, sent with a save as `unit` so the server can
   * count fields answered per unit (0036). A number only; it is never stored
   * with the answer. Omit and nothing is sent.
   */
  currentUnit?: () => number | null;
  /** Device drafts for offline recovery (14.6). Omit for none. */
  drafts?: DraftStore | null;
  /** The drafts bucket for this enrolment (lib/draft-store.ts enrolmentBucket). Required with drafts. */
  draftBucket?: string;
  /** Called when a device draft could not be kept: the device is full, or storage is blocked. */
  onDraftIssue?: (issue: Exclude<DraftWrite, "ok">) => void;
  /** Called once on load with how many unsaved answers were recovered from the device and are being sent. */
  onRecovered?: (count: number) => void;
}

interface Pending {
  timer: ReturnType<typeof setTimeout> | null;
  attempt: number;
  inFlight: boolean;
  dirty: boolean;
}

const DEFAULT_RETRY = [1_000, 2_000, 5_000, 10_000, 30_000] as const;

/** Adds `unit` to a request body when there is a sensible one. */
function withUnit<T extends object>(body: T, unit: number | null): T | (T & { unit: number }) {
  return unit != null && Number.isInteger(unit) && unit >= 1 && unit <= 999 ? { ...body, unit } : body;
}

export class SupabaseAnswerStore implements AnswerStore {
  private readonly values = new Map<string, FieldValue>();
  private readonly pending = new Map<string, Pending>();
  private readonly enrolmentId: string;
  private readonly onStatus: (state: SaveState) => void;
  private readonly fetchFn: typeof fetch;
  private readonly debounceMs: number;
  private readonly retryDelays: readonly number[];
  private readonly endpoint: string;
  private readonly onSaved: (field: string) => void;
  private readonly currentUnit: () => number | null;
  private readonly drafts: DraftStore | null;
  private readonly draftBucket: string;
  private readonly onDraftIssue: (issue: Exclude<DraftWrite, "ok">) => void;
  private readonly onRecovered: (count: number) => void;
  private state: SaveState = "idle";

  constructor(opts: SupabaseAnswerStoreOptions) {
    this.enrolmentId = opts.enrolmentId;
    this.onStatus = opts.onStatus ?? (() => undefined);
    this.fetchFn = opts.fetch ?? ((input, init) => fetch(input, init));
    this.debounceMs = opts.debounceMs ?? 600;
    this.retryDelays = opts.retryDelaysMs ?? DEFAULT_RETRY;
    this.endpoint = opts.endpoint ?? "/api/answers";
    this.onSaved = opts.onSaved ?? (() => undefined);
    this.currentUnit = opts.currentUnit ?? (() => null);
    this.drafts = opts.drafts ?? null;
    this.draftBucket = opts.draftBucket ?? "";
    this.onDraftIssue = opts.onDraftIssue ?? (() => undefined);
    this.onRecovered = opts.onRecovered ?? (() => undefined);
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
    const store = new SupabaseAnswerStore({ ...opts, initial: body.answers ?? {} });
    await store.recover();
    return store;
  }

  /**
   * Offline draft recovery (14.6). Any draft on the device is an answer that
   * was typed and never confirmed by the server, so it is newer than what the
   * server holds for that field unless it matches. Each is put back in
   * memory and sent. A draft the server already holds the same value for is
   * simply deleted.
   */
  async recover(): Promise<number> {
    if (!this.drafts || !this.draftBucket) return 0;
    const records = await this.drafts.list(this.draftBucket);
    let recovered = 0;
    for (const rec of records) {
      if (!splitFieldKey(rec.field)) {
        await this.drafts.remove(this.draftBucket, rec.field);
        continue;
      }
      if (sameValue(this.values.get(rec.field), rec.value)) {
        await this.drafts.remove(this.draftBucket, rec.field);
        continue;
      }
      this.values.set(rec.field, rec.value as FieldValue);
      this.schedule(rec.field, 0);
      recovered += 1;
    }
    if (recovered) this.onRecovered(recovered);
    return recovered;
  }

  get(scope: string, fieldId: string): FieldValue | undefined {
    return this.values.get(fieldKey(scope, fieldId));
  }

  set(scope: string, fieldId: string, value: FieldValue): void {
    const field = fieldKey(scope, fieldId);
    this.values.set(field, value);
    this.keepDraft(field, value);
    this.schedule(field, this.debounceMs);
  }

  private keepDraft(field: string, value: FieldValue): void {
    if (!this.drafts || !this.draftBucket) return;
    void this.drafts.put(this.draftBucket, field, value).then((r) => {
      if (r !== "ok") this.onDraftIssue(r);
    });
  }

  private dropDraft(field: string): void {
    if (!this.drafts || !this.draftBucket) return;
    void this.drafts.remove(this.draftBucket, field);
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
        body: JSON.stringify(withUnit({ enrolment: this.enrolmentId, field, value: value ?? null }, this.currentUnit())),
        keepalive: true,
      });
      // 4xx other than 429 will not get better by retrying; drop the save
      // and let the status show it could not be kept.
      ok = res.ok;
      if (!ok && res.status >= 400 && res.status < 500 && res.status !== 429 && res.status !== 408) {
        p.inFlight = false;
        this.pending.delete(field);
        const refused = res.status === 403 ? await refusalState(res) : "failed";
        // Consent and read-only are about the account, not the answer: the draft stays on the device.
        if (refused === "failed") this.dropDraft(field);
        this.setState(refused);
        return;
      }
    } catch {
      ok = false;
    }
    p.inFlight = false;

    if (ok) {
      p.attempt = 0;
      this.onSaved(field);
      if (p.dirty) {
        this.schedule(field, this.debounceMs);
      } else {
        // The server holds the sealed copy now; nothing plaintext stays on the device.
        this.dropDraft(field);
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

async function refusalState(res: Response): Promise<SaveState> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (body?.error === "consent_required") return "consent";
    if (body?.error === "read_only") return "read_only";
    return "failed";
  } catch {
    return "failed";
  }
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * The AnswerStore for a visitor with no account (5.2). Answers are held in
 * memory and in the device's IndexedDB drafts, in one bucket per workbook,
 * and go nowhere else. Nothing is sent to the server, so nothing is sealed
 * and there is nothing to retry. The status line says where the answers are:
 * "device" while they are kept, "device_full" when the disk would not take
 * them (the answers stay in memory for this visit).
 *
 * When the visitor signs in, ReadClient offers the drafts to the account;
 * accepting writes each through SupabaseAnswerStore.set, which seals it on
 * the server, and the device copy is then cleared.
 */
export class DeviceAnswerStore implements AnswerStore {
  private readonly values = new Map<string, FieldValue>();
  private state: SaveState = "idle";
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly drafts: DraftStore,
    private readonly bucket: string,
    private readonly onStatus: (state: SaveState) => void = () => undefined,
    private readonly debounceMs = 300,
  ) {}

  /** Build a store holding whatever drafts the device already has for this bucket. */
  static async load(drafts: DraftStore, bucket: string, onStatus?: (state: SaveState) => void): Promise<DeviceAnswerStore> {
    const store = new DeviceAnswerStore(drafts, bucket, onStatus);
    for (const rec of await drafts.list(bucket)) {
      if (splitFieldKey(rec.field)) store.values.set(rec.field, rec.value as FieldValue);
    }
    if (store.values.size) store.setState("device");
    return store;
  }

  get(scope: string, fieldId: string): FieldValue | undefined {
    return this.values.get(fieldKey(scope, fieldId));
  }

  set(scope: string, fieldId: string, value: FieldValue): void {
    const field = fieldKey(scope, fieldId);
    this.values.set(field, value);
    const old = this.timers.get(field);
    if (old) clearTimeout(old);
    this.timers.set(
      field,
      setTimeout(() => {
        this.timers.delete(field);
        void this.write(field);
      }, this.debounceMs),
    );
  }

  /** Write everything owed now. Used on page hide. */
  flush(): void {
    for (const [field, timer] of this.timers) {
      clearTimeout(timer);
      this.timers.delete(field);
      void this.write(field);
    }
  }

  get status(): SaveState {
    return this.state;
  }

  get size(): number {
    return this.values.size;
  }

  private async write(field: string): Promise<void> {
    const value = this.values.get(field);
    if (value === undefined) return;
    const result = await this.drafts.put(this.bucket, field, value);
    this.setState(result === "ok" ? "device" : "device_full");
  }

  private setState(next: SaveState): void {
    if (this.state === next) return;
    this.state = next;
    this.onStatus(next);
  }
}
