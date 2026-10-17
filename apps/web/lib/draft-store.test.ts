import { describe, expect, it } from "vitest";
import { DraftStore, MemoryDraftBackend, enrolmentBucket, isQuotaError, requestPersistence, tryBucket } from "@/lib/draft-store";

describe("DraftStore (14.6)", () => {
  it("puts, lists and removes by bucket", async () => {
    const backend = new MemoryDraftBackend();
    const s = new DraftStore(backend);
    expect(await s.put(tryBucket("a"), "exercise:x.y", "one", 1)).toBe("ok");
    expect(await s.put(tryBucket("a"), "exercise:x.z", { rows: [1, 2] }, 2)).toBe("ok");
    expect(await s.put(enrolmentBucket("e1"), "exercise:x.y", "other", 3)).toBe("ok");
    expect((await s.list(tryBucket("a"))).map((r) => r.field).sort()).toEqual(["exercise:x.y", "exercise:x.z"]);
    expect(await s.remove(tryBucket("a"), "exercise:x.y")).toBe(true);
    expect(await s.list(tryBucket("a"))).toHaveLength(1);
    expect(await s.list(enrolmentBucket("e1"))).toHaveLength(1);
  });

  it("overwrites the same field rather than stacking copies", async () => {
    const s = new DraftStore(new MemoryDraftBackend());
    await s.put("b", "exercise:x.y", "first", 1);
    await s.put("b", "exercise:x.y", "second", 2);
    expect(await s.list("b")).toEqual([{ field: "exercise:x.y", value: "second", at: 2 }]);
  });

  it("clears one bucket or everything (sign-out on a shared phone)", async () => {
    const s = new DraftStore(new MemoryDraftBackend());
    await s.put("a", "f.x", 1);
    await s.put("b", "f.x", 1);
    expect(await s.clearBucket("a")).toBe(true);
    expect(await s.list("a")).toEqual([]);
    expect(await s.list("b")).toHaveLength(1);
    expect(await s.clearAll()).toBe(true);
    expect(await s.list("b")).toEqual([]);
  });

  it("reports QuotaExceededError as quota and anything else as unavailable, never throwing", async () => {
    const backend = new MemoryDraftBackend();
    const s = new DraftStore(backend);
    backend.failWith = Object.assign(new Error("x"), { name: "QuotaExceededError" });
    expect(await s.put("a", "f.x", 1)).toBe("quota");
    backend.failWith = new Error("SecurityError: denied");
    expect(await s.put("a", "f.x", 1)).toBe("unavailable");
  });

  it("recognises the quota error in each browser's form", () => {
    expect(isQuotaError({ name: "QuotaExceededError" })).toBe(true);
    expect(isQuotaError({ name: "NS_ERROR_DOM_QUOTA_REACHED" })).toBe(true);
    expect(isQuotaError({ code: 22 })).toBe(true);
    expect(isQuotaError(new Error("other"))).toBe(false);
    expect(isQuotaError(null)).toBe(false);
  });

  it("is a harmless no-op when there is no storage", async () => {
    const s = new DraftStore(null);
    expect(s.available).toBe(false);
    expect(await s.put("a", "f.x", 1)).toBe("unavailable");
    expect(await s.list("a")).toEqual([]);
    expect(await s.remove("a", "f.x")).toBe(false);
    expect(await s.clearAll()).toBe(false);
  });

  it("survives a backend that throws on read", async () => {
    const s = new DraftStore({
      list: async () => {
        throw new Error("boom");
      },
      put: async () => undefined,
      remove: async () => undefined,
      clearBucket: async () => undefined,
      clearAll: async () => undefined,
    });
    expect(await s.list("a")).toEqual([]);
  });
});

describe("requestPersistence", () => {
  it("asks once and reports the answer", async () => {
    let asked = 0;
    expect(await requestPersistence({ persist: async () => (asked++, true), persisted: async () => false })).toBe("granted");
    expect(asked).toBe(1);
    expect(await requestPersistence({ persist: async () => false, persisted: async () => false })).toBe("denied");
  });

  it("does not ask again when storage is already persistent", async () => {
    let asked = 0;
    expect(await requestPersistence({ persist: async () => (asked++, true), persisted: async () => true })).toBe("granted");
    expect(asked).toBe(0);
  });

  it("reports unsupported browsers and never throws", async () => {
    expect(await requestPersistence({})).toBe("unsupported");
    expect(
      await requestPersistence({
        persist: async () => {
          throw new Error("no");
        },
      }),
    ).toBe("unsupported");
  });
});
