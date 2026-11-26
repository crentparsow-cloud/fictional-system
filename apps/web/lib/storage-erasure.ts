/**
 * Removes a deleted person's own files from Storage (review finding M18).
 *
 * When a deletion completes, the database queues the paths of that person's
 * own uploads in public.storage_erasure_queue (migration 0076, which also
 * says which files count as theirs and which are an organisation's record).
 * SQL cannot delete a stored file safely, so the nightly job
 * (app/api/account/complete) reads the queue here, removes each file through
 * the Storage API and marks it done. A removal that fails stays queued and is
 * tried again the next night. A file that is already gone counts as removed.
 *
 * The queue holds a bucket and a path, never a user id. Paths are never
 * logged, only counts and codes.
 */
export const ERASABLE_BUCKETS = ["org-files"] as const;

export interface QueuedFile {
  id: number;
  bucket: string;
  path: string;
}

export interface StorageErasureDeps {
  /** public.storage_erasure_due(p_limit) */
  due(limit: number): Promise<QueuedFile[]>;
  /** Storage API remove. True when the call worked. Throws or returns false on a failure. */
  remove(bucket: string, paths: string[]): Promise<boolean>;
  /** public.storage_erasure_mark(p_ids, p_removed) */
  mark(ids: number[], removed: boolean): Promise<void>;
  log?(code: string, reason: string): void;
}

export interface StorageErasureResult {
  removed: number;
  failed: number;
}

export async function removeQueuedFiles(deps: StorageErasureDeps, limit = 100): Promise<StorageErasureResult> {
  const result: StorageErasureResult = { removed: 0, failed: 0 };
  const due = await deps.due(limit);
  const byBucket = new Map<string, QueuedFile[]>();
  for (const f of due) byBucket.set(f.bucket, [...(byBucket.get(f.bucket) ?? []), f]);

  for (const [bucket, files] of byBucket) {
    const ids = files.map((f) => Number(f.id));
    let ok = false;
    if ((ERASABLE_BUCKETS as readonly string[]).includes(bucket)) {
      try {
        ok = await deps.remove(bucket, files.map((f) => f.path));
      } catch {
        ok = false;
      }
    } else {
      deps.log?.("storage_erasure_unknown_bucket", "skipped");
    }
    try {
      await deps.mark(ids, ok);
    } catch {
      // Not marked: the files are tried again next time, and removing a file twice is harmless.
      ok = false;
      deps.log?.("storage_erasure_mark_failed", "sql");
    }
    if (ok) result.removed += ids.length;
    else result.failed += ids.length;
  }
  return result;
}
