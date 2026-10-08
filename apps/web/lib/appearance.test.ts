import { describe, expect, it } from "vitest";
import {
  APPEARANCE_KEY,
  DEFAULT_APPEARANCE,
  appearanceAttributes,
  applyAppearance,
  isNight,
  loadAppearance,
  parseAppearance,
  saveAppearance,
  serialiseAppearance,
} from "./appearance";

const day = new Date(2026, 9, 7, 14, 0);
const night = new Date(2026, 9, 7, 22, 30);

describe("appearance settings on this device", () => {
  it("falls back to the defaults for anything unknown", () => {
    expect(parseAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance("not json")).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance(JSON.stringify({ textSize: 9, font: "comic", dimAtNight: "yes" }))).toEqual(DEFAULT_APPEARANCE);
    const a = { textSize: 2 as const, font: "lexend" as const, dimAtNight: true, reduceMotion: true };
    expect(parseAppearance(serialiseAppearance(a))).toEqual(a);
  });

  it("sets no attributes for the defaults, so the page is unchanged", () => {
    expect(Object.values(appearanceAttributes(DEFAULT_APPEARANCE, night)).every((v) => v === null)).toBe(true);
  });

  it("maps each setting to an attribute the CSS knows, dimming only at night", () => {
    const a = { textSize: 3 as const, font: "lexend" as const, dimAtNight: true, reduceMotion: true };
    expect(appearanceAttributes(a, night)).toEqual({ "data-text-size": "3", "data-font": "lexend", "data-motion": "reduce", "data-dim": "night" });
    expect(appearanceAttributes(a, day)["data-dim"]).toBeNull();
    expect(isNight(new Date(2026, 9, 7, 4, 59))).toBe(true);
    expect(isNight(new Date(2026, 9, 7, 5, 0))).toBe(false);
    expect(isNight(new Date(2026, 9, 7, 21, 0))).toBe(true);
  });

  it("applies and clears attributes on the element", () => {
    const attrs = new Map<string, string>();
    const el = { setAttribute: (k: string, v: string) => void attrs.set(k, v), removeAttribute: (k: string) => void attrs.delete(k) };
    applyAppearance(el, { ...DEFAULT_APPEARANCE, textSize: 1, font: "lexend" }, day);
    expect(Object.fromEntries(attrs)).toEqual({ "data-text-size": "1", "data-font": "lexend" });
    applyAppearance(el, DEFAULT_APPEARANCE, day);
    expect(attrs.size).toBe(0);
  });

  it("survives blocked storage", () => {
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadAppearance(throwing)).toEqual(DEFAULT_APPEARANCE);
    expect(saveAppearance(throwing, DEFAULT_APPEARANCE)).toBe(false);
    expect(saveAppearance(null, DEFAULT_APPEARANCE)).toBe(false);
    const store = new Map<string, string>();
    const ok = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(saveAppearance(ok, { ...DEFAULT_APPEARANCE, reduceMotion: true })).toBe(true);
    expect(store.has(APPEARANCE_KEY)).toBe(true);
    expect(loadAppearance(ok).reduceMotion).toBe(true);
  });
});
