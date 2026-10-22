import { describe, expect, it } from "vitest";
import {
  DEFAULT_READING,
  fromRecord,
  mergeReading,
  parseStored,
  readingAttributes,
  sameSettings,
  sanitise,
  seedFromAppearance,
  serialiseStored,
  type ReadingSettings,
  type StoredReading,
} from "./settings";

const at = (settings: Partial<ReadingSettings>, updatedAt: number): StoredReading => ({ settings: { ...DEFAULT_READING, ...settings }, updatedAt });

describe("sanitise and parse", () => {
  it("keeps only values it understands", () => {
    expect(sanitise({ font: "comic", size: 9, colour: "dark", margin: "wide", progress: 3, extra: 1 })).toEqual({ colour: "dark", margin: "wide" });
    expect(sanitise(null)).toEqual({});
    expect(sanitise([1])).toEqual({});
  });
  it("round trips through storage", () => {
    const s = at({ font: "dyslexic", size: 3 }, 1000);
    expect(parseStored(serialiseStored(s))).toEqual(s);
  });
  it("treats junk and empty copies as absent", () => {
    expect(parseStored("not json")).toBeNull();
    expect(parseStored(null)).toBeNull();
    expect(parseStored(JSON.stringify({ settings: { font: "nope" }, updatedAt: 5 }))).toBeNull();
  });
  it("reads the database row shape", () => {
    const row = fromRecord({ settings: { font: "lexend" }, updated_at: "2026-10-10T10:00:00.000Z" });
    expect(row?.settings.font).toBe("lexend");
    expect(row?.updatedAt).toBe(Date.parse("2026-10-10T10:00:00.000Z"));
  });
});

describe("mergeReading", () => {
  it("uses the defaults when neither side has anything", () => {
    expect(mergeReading(null, null)).toEqual({ settings: DEFAULT_READING, source: "none", pushToAccount: false, pullToDevice: false });
  });
  it("uses the device when the account has nothing, and offers to send it up", () => {
    const m = mergeReading(at({ size: 2 }, 5), null);
    expect(m).toMatchObject({ source: "device", pushToAccount: true, pullToDevice: false });
    expect(m.settings.size).toBe(2);
  });
  it("uses the account on a new device and keeps a copy there", () => {
    expect(mergeReading(null, at({ colour: "dark" }, 5))).toMatchObject({ source: "account", pullToDevice: true, pushToAccount: false });
  });
  it("lets the newer copy win as a whole", () => {
    const device = at({ size: 4, font: "serif" }, 200);
    const account = at({ size: 1, colour: "dark" }, 100);
    const m = mergeReading(device, account);
    expect(m.source).toBe("device");
    expect(m.settings).toEqual(device.settings);
    expect(m.pushToAccount).toBe(true);
    const back = mergeReading(at({ size: 4 }, 100), at({ size: 1 }, 200));
    expect(back).toMatchObject({ source: "account", pullToDevice: true });
    expect(back.settings.size).toBe(1);
  });
  it("sends or pulls nothing when the two copies already agree", () => {
    const a = at({ size: 2 }, 100);
    expect(mergeReading(at({ size: 2 }, 300), a)).toMatchObject({ pushToAccount: false, pullToDevice: false });
    expect(mergeReading(a, at({ size: 2 }, 300))).toMatchObject({ pushToAccount: false, pullToDevice: false });
  });
  it("keeps the account copy when the times are equal", () => {
    expect(mergeReading(at({ size: 1 }, 100), at({ size: 3 }, 100)).settings.size).toBe(3);
  });
});

describe("seedFromAppearance and attributes", () => {
  it("carries the older font and size across", () => {
    expect(seedFromAppearance({ textSize: 2, font: "lexend" })).toMatchObject({ size: 2, font: "lexend" });
    expect(seedFromAppearance({ textSize: 9, font: "x" })).toMatchObject({ size: 0, font: "serif" });
    expect(seedFromAppearance(null)).toEqual(DEFAULT_READING);
  });
  it("removes every attribute at the defaults", () => {
    expect(Object.values(readingAttributes(DEFAULT_READING)).every((v) => v === null)).toBe(true);
  });
  it("sets attributes the stylesheet reads", () => {
    expect(readingAttributes({ font: "dyslexic", size: 4, colour: "dark", margin: "wide", progress: "none", focus: "both", thennow: "on" })).toEqual({
      "data-text-size": "4",
      "data-font": "dyslexic",
      "data-theme": "dark",
      "data-margin": "wide",
      "data-progress": "none",
      "data-focus": "both",
    });
  });
  it("accepts the focus and then-and-now choices and drops anything else", () => {
    expect(sanitise({ focus: "dim", thennow: "on" })).toEqual({ focus: "dim", thennow: "on" });
    expect(sanitise({ focus: "strobe", thennow: true })).toEqual({});
    expect(DEFAULT_READING.focus).toBe("off");
    expect(DEFAULT_READING.thennow).toBe("off");
  });
  it("treats a stored copy from before focus mode as having it off", () => {
    const stored = fromRecord({ settings: { font: "lexend" }, updatedAt: 5 });
    expect(stored?.settings.focus).toBe("off");
    expect(stored?.settings.thennow).toBe("off");
  });
  it("counts a focus change as a change", () => {
    expect(sameSettings(DEFAULT_READING, { ...DEFAULT_READING, focus: "dim" })).toBe(false);
    expect(sameSettings(DEFAULT_READING, { ...DEFAULT_READING, thennow: "on" })).toBe(false);
  });
});
