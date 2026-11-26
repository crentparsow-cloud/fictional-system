import { describe, expect, it, vi } from "vitest";
import { removeQueuedFiles, type QueuedFile, type StorageErasureDeps } from "@/lib/storage-erasure";

function fake(queue: QueuedFile[], o: { failRemove?: boolean; throwRemove?: boolean; failMark?: boolean } = {}) {
  const stored = new Set(queue.map((f) => `${f.bucket}/${f.path}`));
  const done = new Set<number>();
  const attempts = new Map<number, number>();
  const deps: StorageErasureDeps = {
    due: vi.fn(async (limit: number) => queue.filter((f) => !done.has(f.id)).slice(0, limit)),
    remove: vi.fn(async (bucket: string, paths: string[]) => {
      if (o.throwRemove) throw new Error("network");
      if (o.failRemove) return false;
      for (const p of paths) stored.delete(`${bucket}/${p}`);
      return true;
    }),
    mark: vi.fn(async (ids: number[], removed: boolean) => {
      if (o.failMark) throw new Error("sql");
      for (const id of ids) {
        attempts.set(id, (attempts.get(id) ?? 0) + 1);
        if (removed) done.add(id);
      }
    }),
    log: vi.fn(),
  };
  return { deps, stored, done, attempts };
}

const files: QueuedFile[] = [
  { id: 1, bucket: "org-files", path: "org-a/manuscripts/one.pdf" },
  { id: 2, bucket: "org-files", path: "org-a/manuscripts/two.pdf" },
];

describe("removing a deleted person's files from storage", () => {
  it("removes every queued file through the Storage API and marks it done", async () => {
    const f = fake(files);
    expect(await removeQueuedFiles(f.deps)).toEqual({ removed: 2, failed: 0 });
    expect(f.deps.remove).toHaveBeenCalledWith("org-files", ["org-a/manuscripts/one.pdf", "org-a/manuscripts/two.pdf"]);
    expect(f.stored.size).toBe(0);
    expect([...f.done]).toEqual([1, 2]);
    // A second night finds nothing to do.
    expect(await removeQueuedFiles(f.deps)).toEqual({ removed: 0, failed: 0 });
    expect(f.deps.remove).toHaveBeenCalledTimes(1);
  });

  it("leaves a failed removal queued, counts the attempt and tries again next time", async () => {
    for (const o of [{ failRemove: true }, { throwRemove: true }]) {
      const f = fake(files, o);
      expect(await removeQueuedFiles(f.deps)).toEqual({ removed: 0, failed: 2 });
      expect(f.deps.mark).toHaveBeenCalledWith([1, 2], false);
      expect(f.done.size).toBe(0);
      expect(f.attempts.get(1)).toBe(1);
      expect(f.stored.size).toBe(2);
    }
  });

  it("counts a removal it could not mark as failed, so the totals never overstate", async () => {
    const f = fake(files, { failMark: true });
    expect(await removeQueuedFiles(f.deps)).toEqual({ removed: 0, failed: 2 });
  });

  it("never touches a bucket it does not know", async () => {
    const f = fake([{ id: 9, bucket: "somewhere-else", path: "x" }]);
    expect(await removeQueuedFiles(f.deps)).toEqual({ removed: 0, failed: 1 });
    expect(f.deps.remove).not.toHaveBeenCalled();
    expect(f.deps.mark).toHaveBeenCalledWith([9], false);
  });

  it("logs codes only, never a path", async () => {
    const f = fake(files, { failMark: true });
    await removeQueuedFiles(f.deps);
    expect(JSON.stringify((f.deps.log as ReturnType<typeof vi.fn>).mock.calls)).not.toContain("manuscripts");
  });
});
