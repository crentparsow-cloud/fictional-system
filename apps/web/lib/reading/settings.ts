/**
 * The reading settings panel (the "Aa" button): font, size, page colour,
 * margin width and how progress is shown. Kept on the account so a reader's
 * phone and laptop agree, with the device as the fallback when the account
 * cannot be reached or the reader is not signed in.
 *
 * Pure helpers here. The components read and write storage and call the
 * server inside try/catch, and nothing breaks if either is missing.
 */
export const READING_KEY = "ak:reading";
/** Fired on window after a change so the page applies it at once. */
export const READING_EVENT = "akana:reading";

/** "serif" is the active design direction's reading serif, the standard. */
export const FONTS = ["serif", "atkinson", "lexend", "dyslexic"] as const;
export type ReadingFontChoice = (typeof FONTS)[number];

/** Text size steps. 0 is the standard 17px; each step is a little larger. */
export const SIZE_STEPS = [0, 1, 2, 3, 4, 5] as const;
export type SizeStep = (typeof SIZE_STEPS)[number];
export const SIZE_PX: Record<SizeStep, number> = { 0: 17, 1: 18, 2: 20, 3: 22, 4: 24, 5: 28 };

/** "auto" follows the device. The others are the themes the site already has. */
export const COLOURS = ["auto", "light", "dark"] as const;
export type PageColour = (typeof COLOURS)[number];

export const MARGINS = ["narrow", "standard", "wide"] as const;
export type MarginWidth = (typeof MARGINS)[number];

/** both: dots and the time estimate. time: the estimate only. none: neither. */
export const PROGRESS = ["both", "time", "none"] as const;
export type ProgressDisplay = (typeof PROGRESS)[number];

/**
 * Focus mode (3.11). dim: paragraphs other than the one being read are
 * softened. typewriter: the line being written stays near the middle of the
 * screen in a long answer. Optional and off until the reader chooses.
 */
export const FOCUS = ["off", "dim", "typewriter", "both"] as const;
export type FocusMode = (typeof FOCUS)[number];

/** "Then and now" (3.10): whether the one tap check-in is offered before a step. Off until chosen. */
export const THENNOW = ["off", "on"] as const;
export type ThenNowChoice = (typeof THENNOW)[number];

export interface ReadingSettings {
  font: ReadingFontChoice;
  size: SizeStep;
  colour: PageColour;
  margin: MarginWidth;
  progress: ProgressDisplay;
  focus: FocusMode;
  thennow: ThenNowChoice;
}

export const DEFAULT_READING: ReadingSettings = { font: "serif", size: 0, colour: "auto", margin: "standard", progress: "both", focus: "off", thennow: "off" };

/** The settings as stored, with the time they were last changed. */
export interface StoredReading {
  settings: ReadingSettings;
  /** Milliseconds since the epoch. */
  updatedAt: number;
}

const oneOf = <T extends string>(list: readonly T[], v: unknown): T | undefined => (typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : undefined);

/** Reads whatever is given and keeps only the values it understands. */
export function sanitise(raw: unknown): Partial<ReadingSettings> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const out: Partial<ReadingSettings> = {};
  const font = oneOf(FONTS, o.font);
  if (font) out.font = font;
  if (typeof o.size === "number" && (SIZE_STEPS as readonly number[]).includes(o.size)) out.size = o.size as SizeStep;
  const colour = oneOf(COLOURS, o.colour);
  if (colour) out.colour = colour;
  const margin = oneOf(MARGINS, o.margin);
  if (margin) out.margin = margin;
  const progress = oneOf(PROGRESS, o.progress);
  if (progress) out.progress = progress;
  const focus = oneOf(FOCUS, o.focus);
  if (focus) out.focus = focus;
  const thennow = oneOf(THENNOW, o.thennow);
  if (thennow) out.thennow = thennow;
  return out;
}

export function withDefaults(partial: Partial<ReadingSettings>): ReadingSettings {
  return { ...DEFAULT_READING, ...partial };
}

export function parseStored(raw: string | null | undefined): StoredReading | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  return fromRecord(v);
}

/** From a parsed object: { settings, updatedAt }, or the database row shape { settings, updated_at }. */
export function fromRecord(v: unknown): StoredReading | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  const picked = sanitise(o.settings);
  if (!Object.keys(picked).length) return null;
  const stamp = typeof o.updatedAt === "number" ? o.updatedAt : typeof o.updated_at === "string" ? Date.parse(o.updated_at) : 0;
  return { settings: withDefaults(picked), updatedAt: Number.isFinite(stamp) ? stamp : 0 };
}

export function serialiseStored(s: StoredReading): string {
  return JSON.stringify({ settings: s.settings, updatedAt: s.updatedAt });
}

export interface Merged {
  settings: ReadingSettings;
  /** Where the winning copy lives. "none" means neither side had anything and the defaults apply. */
  source: "account" | "device" | "none";
  /** The device copy is newer and should be sent to the account. */
  pushToAccount: boolean;
  /** The account copy is newer and should be kept on the device. */
  pullToDevice: boolean;
}

/**
 * The newer copy wins, as a whole. A reader who changed the size on the
 * phone yesterday and the font on the laptop today gets the laptop's copy
 * everywhere, which is predictable and easy to explain. A copy with nothing
 * usable in it is treated as absent. Equal times keep the account's copy.
 */
export function mergeReading(device: StoredReading | null, account: StoredReading | null): Merged {
  if (!device && !account) return { settings: { ...DEFAULT_READING }, source: "none", pushToAccount: false, pullToDevice: false };
  if (!account) return { settings: device!.settings, source: "device", pushToAccount: true, pullToDevice: false };
  if (!device) return { settings: account.settings, source: "account", pushToAccount: false, pullToDevice: true };
  if (device.updatedAt > account.updatedAt) return { settings: device.settings, source: "device", pushToAccount: !sameSettings(device.settings, account.settings), pullToDevice: false };
  return { settings: account.settings, source: "account", pushToAccount: false, pullToDevice: !sameSettings(device.settings, account.settings) };
}

export function sameSettings(a: ReadingSettings, b: ReadingSettings): boolean {
  return a.font === b.font && a.size === b.size && a.colour === b.colour && a.margin === b.margin && a.progress === b.progress && a.focus === b.focus && a.thennow === b.thennow;
}

/**
 * Starting values for a reader who has never opened the panel, taken from the
 * older Appearance setting on this device so nobody loses a choice they made.
 */
export function seedFromAppearance(a: { textSize: number; font: string } | null): ReadingSettings {
  if (!a) return { ...DEFAULT_READING };
  const size = (SIZE_STEPS as readonly number[]).includes(a.textSize) ? (a.textSize as SizeStep) : 0;
  return { ...DEFAULT_READING, size, font: a.font === "lexend" ? "lexend" : DEFAULT_READING.font };
}

export type HtmlAttr = "data-text-size" | "data-font" | "data-theme" | "data-margin" | "data-progress" | "data-focus";

/** The attributes to set on <html>. null removes one. The defaults remove all of them. */
export function readingAttributes(s: ReadingSettings): Record<HtmlAttr, string | null> {
  return {
    "data-text-size": s.size === 0 ? null : String(s.size),
    "data-font": s.font === "serif" ? null : s.font,
    "data-theme": s.colour === "auto" ? null : s.colour,
    "data-margin": s.margin === "standard" ? null : s.margin,
    "data-progress": s.progress === "both" ? null : s.progress,
    "data-focus": s.focus === "off" ? null : s.focus,
  };
}

export function applyReading(el: Pick<Element, "setAttribute" | "removeAttribute">, s: ReadingSettings): void {
  for (const [name, value] of Object.entries(readingAttributes(s))) {
    if (value === null) el.removeAttribute(name);
    else el.setAttribute(name, value);
  }
}

export const FONT_LABELS: Record<ReadingFontChoice, { name: string; note: string }> = {
  serif: { name: "Book serif", note: "The reading face of this site. The standard." },
  atkinson: { name: "Atkinson Hyperlegible", note: "Designed for low vision." },
  lexend: { name: "Lexend", note: "Wide, even spacing." },
  dyslexic: { name: "Dyslexia-friendly", note: "A weighted-base face based on OpenDyslexic." },
};
export const COLOUR_LABELS: Record<PageColour, string> = { auto: "Match my device", light: "Light", dark: "Dark" };
export const MARGIN_LABELS: Record<MarginWidth, string> = { narrow: "Narrow", standard: "Standard", wide: "Wide" };
export const FOCUS_LABELS: Record<FocusMode, string> = { off: "Off", dim: "Dim other paragraphs", typewriter: "Keep my line centred", both: "Both" };
export const THENNOW_LABELS: Record<ThenNowChoice, string> = { off: "Off", on: "Ask me before a step" };
export const PROGRESS_LABELS: Record<ProgressDisplay, string> = { both: "Dots and time", time: "Time only", none: "Hidden" };
