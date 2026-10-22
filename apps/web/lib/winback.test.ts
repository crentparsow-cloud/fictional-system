import { describe, expect, it } from "vitest";
import { runWinback, seasonKey, winbackEnabled, type DueWinback, type WinbackDeps } from "@/lib/winback";

describe("seasonKey", () => {
  it("uses UK meteorological seasons", () => {
    expect(seasonKey(new Date("2026-03-01T12:00:00Z"))).toBe("2026-spring");
    expect(seasonKey(new Date("2026-05-31T12:00:00Z"))).toBe("2026-spring");
    expect(seasonKey(new Date("2026-06-01T12:00:00Z"))).toBe("2026-summer");
    expect(seasonKey(new Date("2026-08-31T12:00:00Z"))).toBe("2026-summer");
    expect(seasonKey(new Date("2026-09-01T12:00:00Z"))).toBe("2026-autumn");
    expect(seasonKey(new Date("2026-11-30T12:00:00Z"))).toBe("2026-autumn");
    expect(seasonKey(new Date("2026-12-01T12:00:00Z"))).toBe("2026-winter");
  });
  it("gives one winter key across the new year", () => {
    expect(seasonKey(new Date("2026-12-31T12:00:00Z"))).toBe("2026-winter");
    expect(seasonKey(new Date("2027-01-01T12:00:00Z"))).toBe("2026-winter");
    expect(seasonKey(new Date("2027-02-28T12:00:00Z"))).toBe("2026-winter");
    expect(seasonKey(new Date("2027-03-01T00:00:00Z"))).toBe("2027-spring");
  });
  it("reads the date in UK time", () => {
    // 23:30 UTC on 31 August is already 1 September in London during British Summer Time
    expect(seasonKey(new Date("2026-08-31T23:30:00Z"))).toBe("2026-autumn");
  });
});

describe("winbackEnabled", () => {
  it("is off while blank", () => {
    expect(winbackEnabled({})).toBe(false);
    expect(winbackEnabled({ WINBACK_ENABLED: "" })).toBe(false);
    expect(winbackEnabled({ WINBACK_ENABLED: "no" })).toBe(false);
  });
  it("is on for a clear yes", () => {
    expect(winbackEnabled({ WINBACK_ENABLED: "true" })).toBe(true);
    expect(winbackEnabled({ WINBACK_ENABLED: " 1 " })).toBe(true);
  });
});

function deps(over: Partial<WinbackDeps> & { list?: DueWinback[] } = {}) {
  const log = { claimed: [] as string[], released: [] as string[], sent: [] as { id: string; token: string; season: string }[], hashes: [] as string[] };
  const claimedSeason = new Set<string>();
  let n = 0;
  const d: WinbackDeps = {
    now: new Date("2026-10-21T10:00:00Z"),
    limit: 50,
    async due() {
      return over.list ?? [];
    },
    async claim(w, season, hash) {
      const k = `${w.userId}:${season}`;
      if (claimedSeason.has(k)) return false;
      claimedSeason.add(k);
      log.claimed.push(w.userId);
      log.hashes.push(hash);
      return true;
    },
    async release(w, season) {
      claimedSeason.delete(`${w.userId}:${season}`);
      log.released.push(w.userId);
    },
    async send(w, season, token) {
      log.sent.push({ id: w.userId, token, season });
      return true;
    },
    mintToken: () => `token-${++n}`,
    hash: async (t) => `hash-${t}`,
    ...over,
  };
  return { d, log };
}

const A: DueWinback = { userId: "a", email: "a@example.test", kind: "monthly" };
const B: DueWinback = { userId: "b", email: "b@example.test", kind: "one_off" };

describe("runWinback", () => {
  it("sends one note to each reader and records the season", async () => {
    const { d, log } = deps({ list: [A, B] });
    const out = await runWinback(d);
    expect(out).toEqual({ season: "2026-autumn", due: 2, sent: 2, already_sent: 0, failed: 0 });
    expect(log.sent.map((s) => s.id)).toEqual(["a", "b"]);
    expect(log.sent.every((s) => s.season === "2026-autumn")).toBe(true);
  });
  it("stores only a hash of the unsubscribe token", async () => {
    const { d, log } = deps({ list: [A] });
    await runWinback(d);
    expect(log.hashes).toEqual(["hash-token-1"]);
    expect(log.sent[0]?.token).toBe("token-1");
  });
  it("sends nothing new on a second run in the same season", async () => {
    const { d, log } = deps({ list: [A, B] });
    await runWinback(d);
    const again = await runWinback(d);
    expect(again).toMatchObject({ due: 2, sent: 0, already_sent: 2 });
    expect(log.sent).toHaveLength(2);
  });
  it("sends again in a new season", async () => {
    const { d, log } = deps({ list: [A] });
    await runWinback(d);
    d.now = new Date("2026-12-02T10:00:00Z");
    await runWinback(d);
    expect(log.sent.map((s) => s.season)).toEqual(["2026-autumn", "2026-winter"]);
  });
  it("hands the season back when the send fails, so the next run tries again", async () => {
    let fail = true;
    const { d, log } = deps({
      list: [A],
      async send(w, season, token) {
        if (fail) return false;
        log.sent.push({ id: w.userId, token, season });
        return true;
      },
    });
    const first = await runWinback(d);
    expect(first).toMatchObject({ sent: 0, failed: 1 });
    expect(log.released).toEqual(["a"]);
    fail = false;
    const second = await runWinback(d);
    expect(second).toMatchObject({ sent: 1, failed: 0 });
  });
  it("counts a throwing send as a failure and carries on", async () => {
    const { d, log } = deps({
      list: [A, B],
      async send(w) {
        if (w.userId === "a") throw new Error("boom");
        return true;
      },
    });
    const out = await runWinback(d);
    expect(out).toMatchObject({ sent: 1, failed: 1 });
    expect(log.released).toEqual(["a"]);
  });
  it("counts a failed claim and does not send", async () => {
    const { d } = deps({
      list: [A],
      async claim() {
        throw new Error("db");
      },
    });
    expect(await runWinback(d)).toMatchObject({ sent: 0, failed: 1 });
  });
  it("passes the limit to the query", async () => {
    let seen = 0;
    const { d } = deps({
      async due(_s, limit) {
        seen = limit;
        return [];
      },
    });
    await runWinback({ ...d, limit: 7 });
    expect(seen).toBe(7);
  });
});
