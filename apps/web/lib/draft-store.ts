/**
 * Device drafts (5.2, 14.6): answers written but not yet safely on the
 * server, kept in IndexedDB so a closed tab, a dropped connection or a
 * crash does not lose them.
 *
 * Two uses, one store:
 *   - a visitor with no account tries the free first unit. Their answers live
 *     here only, in the bucket "try:<slug>", and are offered to the account
 *     when they sign in;
 *   - a signed-in reader's answers wait here, in the bucket
 *     "enrolment:<id>", from the moment they are typed until the server
 *     confirms the save. The confirmed copy is then deleted from the device.
 *     Sealed answers stay sealed: once an answer has reached the server it is
 *     only ever the server's sealed copy, and no plaintext is left behind.
 *
 * Safari's seven-day rule (see lib/pwa.ts SAFARI_SEVEN_DAY_RULE): Safari
 * clears script-writable storage for a site not visited in seven days of
 * use. Drafts in a browser tab can therefore vanish. A web app on the home
 * screen is exempt and keeps its own clock, so the install guide says to
 * install for unsaved work. navigator.storage.persist() is requested after
 * install (requestPersistence) for browsers that honour it.
 *
 * Every call is wrapped. A browser with storage blocked, a private window or
 * a full disk gives a result code, never an exception, and the reader's
 * typing carries on in memory. QuotaExceededError is reported as "quota" so
 * the page can say the device is full.
 */

export interface DraftRecord {
  /** The answer path, as the AnswerStore keys it ("exercise:ex_one.f_one"). */
  field: string;
  /** Any JSON value the engine writes. */
  value: unknown;
  /** Milliseconds since the epoch when it was written. */
  at: number;
}

/** The storage under a DraftStore. IndexedDB in the browser, memory in tests. */
export interface DraftBackend {
  list(bucket: string): Promise<DraftRecord[]>;
  put(bucket: string, record: DraftRecord): Promise<void>;
  remove(bucket: string, field: string): Promise<void>;
  clearBucket(bucket: string): Promise<void>;
  clearAll(): Promise<void>;
}

export type DraftWrite = "ok" | "quota" | "unavailable";

export const TRY_BUCKET_PREFIX = "try:";
export const ENROLMENT_BUCKET_PREFIX = "enrolment:";
export const tryBucket = (slug: string) => `${TRY_BUCKET_PREFIX}${slug}`;
export const enrolmentBucket = (id: string) => `${ENROLMENT_BUCKET_PREFIX}${id}`;

/** True for the error browsers raise when storage is full. */
export function isQuotaError(err: unknown): boolean {
  const e = err as { name?: unknown; code?: unknown } | null;
  return e?.name === "QuotaExceededError" || e?.name === "NS_ERROR_DOM_QUOTA_REACHED" || e?.code === 22 || e?.code === 1014;
}

/** The safe wrapper the stores use. Pass null when there is no storage at all. */
export class DraftStore {
  constructor(private readonly backend: DraftBackend | null) {}

  get available(): boolean {
    return this.backend !== null;
  }

  async put(bucket: string, field: string, value: unknown, at: number = Date.now()): Promise<DraftWrite> {
    if (!this.backend) return "unavailable";
    try {
      await this.backend.put(bucket, { field, value, at });
      return "ok";
    } catch (err) {
      return isQuotaError(err) ? "quota" : "unavailable";
    }
  }

  async list(bucket: string): Promise<DraftRecord[]> {
    if (!this.backend) return [];
    try {
      return await this.backend.list(bucket);
    } catch {
      return [];
    }
  }

  async remove(bucket: string, field: string): Promise<boolean> {
    if (!this.backend) return false;
    try {
      await this.backend.remove(bucket, field);
      return true;
    } catch {
      return false;
    }
  }

  async clearBucket(bucket: string): Promise<boolean> {
    if (!this.backend) return false;
    try {
      await this.backend.clearBucket(bucket);
      return true;
    } catch {
      return false;
    }
  }

  /** Everything on this device, for sign-out on a shared phone. */
  async clearAll(): Promise<boolean> {
    if (!this.backend) return false;
    try {
      await this.backend.clearAll();
      return true;
    } catch {
      return false;
    }
  }
}

/** An in-memory backend for tests. `failWith` makes every write throw that error. */
export class MemoryDraftBackend implements DraftBackend {
  readonly buckets = new Map<string, Map<string, DraftRecord>>();
  failWith: unknown = null;

  async list(bucket: string): Promise<DraftRecord[]> {
    return [...(this.buckets.get(bucket)?.values() ?? [])].map((r) => ({ ...r }));
  }
  async put(bucket: string, record: DraftRecord): Promise<void> {
    if (this.failWith) throw this.failWith;
    let b = this.buckets.get(bucket);
    if (!b) this.buckets.set(bucket, (b = new Map()));
    b.set(record.field, { ...record });
  }
  async remove(bucket: string, field: string): Promise<void> {
    this.buckets.get(bucket)?.delete(field);
  }
  async clearBucket(bucket: string): Promise<void> {
    this.buckets.delete(bucket);
  }
  async clearAll(): Promise<void> {
    this.buckets.clear();
  }
}

// ---------------------------------------------------------------------------
// IndexedDB
// ---------------------------------------------------------------------------

const DB_NAME = "akana-drafts";
const STORE = "drafts";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new DOMException("aborted", "AbortError"));
  });
}

interface Row {
  id: string;
  bucket: string;
  field: string;
  value: unknown;
  at: number;
}

export class IndexedDbDraftBackend implements DraftBackend {
  private db: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("bucket", "bucket");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    // A failed open is retried on the next call rather than remembered.
    this.db.catch(() => {
      this.db = null;
    });
    return this.db;
  }

  async list(bucket: string): Promise<DraftRecord[]> {
    const db = await this.open();
    const rows = await request<Row[]>(db.transaction(STORE, "readonly").objectStore(STORE).index("bucket").getAll(bucket));
    return rows.map((r) => ({ field: r.field, value: r.value, at: r.at }));
  }

  async put(bucket: string, record: DraftRecord): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ id: `${bucket}|${record.field}`, bucket, field: record.field, value: record.value, at: record.at } satisfies Row);
    await done(tx);
  }

  async remove(bucket: string, field: string): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(`${bucket}|${field}`);
    await done(tx);
  }

  async clearBucket(bucket: string): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const keys = await request<IDBValidKey[]>(store.index("bucket").getAllKeys(bucket));
    for (const k of keys) store.delete(k);
    await done(tx);
  }

  async clearAll(): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    await done(tx);
  }
}

let shared: DraftStore | null = null;

/** The one DraftStore for this page. Null-backed (every call a harmless no-op) when IndexedDB is missing. */
export function deviceDrafts(): DraftStore {
  if (shared) return shared;
  let backend: DraftBackend | null = null;
  try {
    if (typeof indexedDB !== "undefined" && indexedDB) backend = new IndexedDbDraftBackend();
  } catch {
    backend = null;
  }
  shared = new DraftStore(backend);
  return shared;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export type PersistResult = "granted" | "denied" | "unsupported";

interface StorageManagerLike {
  persist?: () => Promise<boolean>;
  persisted?: () => Promise<boolean>;
}

/**
 * Ask the browser to keep this site's storage (navigator.storage.persist),
 * so drafts are not first in line to be cleared. Called after install, when
 * the reader has shown they want the app. Never throws.
 */
export async function requestPersistence(storage?: StorageManagerLike | null): Promise<PersistResult> {
  try {
    const s = storage ?? (typeof navigator !== "undefined" ? (navigator.storage as StorageManagerLike | undefined) : undefined);
    if (!s?.persist) return "unsupported";
    if (s.persisted && (await s.persisted())) return "granted";
    return (await s.persist()) ? "granted" : "denied";
  } catch {
    return "unsupported";
  }
}
