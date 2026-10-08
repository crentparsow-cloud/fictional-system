/**
 * Appearance settings on You (F-015 parity with the old app's Appearance
 * page): text size, reading font, dim at night and reduced motion. Kept on
 * this device only, in localStorage, and applied as attributes on <html> so
 * the CSS does the work. No inline styles, so the CSP stays as it is.
 *
 * Pure helpers here; the components read and write storage inside try/catch.
 */

export const APPEARANCE_KEY = "ak:appearance";
/** Fired on window after a change, so the page applies it at once. */
export const APPEARANCE_EVENT = "akana:appearance";

export type TextSize = 0 | 1 | 2 | 3;
export type ReadingFont = "atkinson" | "lexend";

export interface Appearance {
  textSize: TextSize;
  font: ReadingFont;
  dimAtNight: boolean;
  reduceMotion: boolean;
}

export const DEFAULT_APPEARANCE: Appearance = { textSize: 0, font: "atkinson", dimAtNight: false, reduceMotion: false };

/** Root font sizes for the four steps, as in the old app. The CSS holds the same numbers. */
export const TEXT_SIZES_PX: Record<TextSize, number> = { 0: 17, 1: 18, 2: 20, 3: 22 };

/** Read a stored value defensively. Anything unknown falls back to the default. */
export function parseAppearance(raw: string | null | undefined): Appearance {
  if (!raw) return { ...DEFAULT_APPEARANCE };
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
  if (typeof v !== "object" || v === null) return { ...DEFAULT_APPEARANCE };
  const o = v as Record<string, unknown>;
  const size = typeof o.textSize === "number" && [0, 1, 2, 3].includes(o.textSize) ? (o.textSize as TextSize) : 0;
  return {
    textSize: size,
    font: o.font === "lexend" ? "lexend" : "atkinson",
    dimAtNight: o.dimAtNight === true,
    reduceMotion: o.reduceMotion === true,
  };
}

export function serialiseAppearance(a: Appearance): string {
  return JSON.stringify({ textSize: a.textSize, font: a.font, dimAtNight: a.dimAtNight, reduceMotion: a.reduceMotion });
}

/** 9 p.m. to 5 a.m. on the device's clock, as in the old app. */
export function isNight(d: Date): boolean {
  const h = d.getHours();
  return h >= 21 || h < 5;
}

/**
 * The attributes to set on <html>. null means remove it. Defaults remove
 * every attribute, so a reader who never opens the settings gets the page
 * exactly as before.
 */
export function appearanceAttributes(a: Appearance, now: Date): Record<"data-text-size" | "data-font" | "data-motion" | "data-dim", string | null> {
  return {
    "data-text-size": a.textSize === 0 ? null : String(a.textSize),
    "data-font": a.font === "lexend" ? "lexend" : null,
    "data-motion": a.reduceMotion ? "reduce" : null,
    "data-dim": a.dimAtNight && isNight(now) ? "night" : null,
  };
}

/** Load from this device. Storage can be blocked; then the defaults apply. */
export function loadAppearance(storage: Pick<Storage, "getItem"> | null | undefined): Appearance {
  try {
    return parseAppearance(storage?.getItem(APPEARANCE_KEY));
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

/** Save on this device. Returns false when storage is blocked. */
export function saveAppearance(storage: Pick<Storage, "setItem"> | null | undefined, a: Appearance): boolean {
  try {
    if (!storage) return false;
    storage.setItem(APPEARANCE_KEY, serialiseAppearance(a));
    return true;
  } catch {
    return false;
  }
}

/** Set or clear the attributes on an element (the <html> element in the app). */
export function applyAppearance(el: Pick<Element, "setAttribute" | "removeAttribute">, a: Appearance, now: Date): void {
  for (const [name, value] of Object.entries(appearanceAttributes(a, now))) {
    if (value === null) el.removeAttribute(name);
    else el.setAttribute(name, value);
  }
}

/** localStorage, or null when the browser refuses it. */
export function deviceStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
