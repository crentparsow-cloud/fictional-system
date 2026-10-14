import { describe, expect, it } from "vitest";
import { causeFor, saveLine } from "./autosave";

describe("saveLine", () => {
  it("uses the four plain states", () => {
    expect(saveLine({ state: "unsaved" }).text).toBe("Unsaved changes");
    expect(saveLine({ state: "saving" }).text).toBe("Saving");
    expect(saveLine({ state: "saved", savedAt: 1000, now: 5000 }).text).toBe("Saved just now");
    expect(saveLine({ state: "retrying", cause: "offline" })).toEqual({
      text: "Couldn't save, retrying. You appear to be offline.",
      retry: true,
      tone: "warn",
    });
  });
  it("says only 'Saved' once a minute has passed", () => {
    expect(saveLine({ state: "saved", savedAt: 0, now: 61_000 }).text).toBe("Saved");
    expect(saveLine({ state: "saved", savedAt: 0, now: 60_000 }).text).toBe("Saved just now");
  });
  it("offers Retry only while retrying", () => {
    const states = ["idle", "unsaved", "saving", "saved", "retrying", "failed", "consent", "read_only", "device", "device_full"] as const;
    expect(states.filter((s) => saveLine({ state: s }).retry)).toEqual(["retrying"]);
  });
  it("names the cause, and says when the words are kept on the device", () => {
    expect(saveLine({ state: "retrying", cause: "busy", keptOnDevice: true }).text).toBe("Couldn't save, retrying. The server is busy. Your latest words are kept on this device.");
    expect(saveLine({ state: "retrying" }).text).toBe("Couldn't save, retrying.");
  });
  it("shows nothing when idle", () => {
    expect(saveLine({ state: "idle" }).text).toBe("");
  });
  it("keeps to the house style", () => {
    const all = (["unsaved", "saving", "saved", "retrying", "failed", "consent", "read_only", "device", "device_full"] as const).map((s) => saveLine({ state: s, cause: "server" }).text);
    for (const t of all) {
      expect(t).not.toMatch(/—|–|!/);
      for (const sentence of t.split(/(?<=\.)\s/)) expect(sentence.split(/\s+/).length).toBeLessThanOrEqual(25);
    }
  });
});

describe("causeFor", () => {
  it("tells offline from an unreachable server", () => {
    expect(causeFor(undefined, false)).toBe("offline");
    expect(causeFor(undefined, true)).toBe("network");
    expect(causeFor(undefined, undefined)).toBe("network");
  });
  it("maps statuses", () => {
    expect(causeFor(429, true)).toBe("busy");
    expect(causeFor(408, true)).toBe("slow");
    expect(causeFor(503, true)).toBe("server");
  });
});
