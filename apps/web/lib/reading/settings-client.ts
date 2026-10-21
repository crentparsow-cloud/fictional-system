import { deviceStorage, loadAppearance } from "@/lib/appearance";
import {
  READING_EVENT,
  READING_KEY,
  applyReading,
  parseStored,
  seedFromAppearance,
  serialiseStored,
  withDefaults,
  type ReadingSettings,
  type StoredReading,
} from "./settings";

/** Browser side of the reading settings. Every storage touch is in try/catch: a blocked store changes nothing else. */

export function loadDeviceReading(): StoredReading | null {
  try {
    return parseStored(deviceStorage()?.getItem(READING_KEY));
  } catch {
    return null;
  }
}

export function saveDeviceReading(s: StoredReading): boolean {
  try {
    const store = deviceStorage();
    if (!store) return false;
    store.setItem(READING_KEY, serialiseStored(s));
    return true;
  } catch {
    return false;
  }
}

/** What the panel shows when nothing has been chosen yet: the older Appearance choices, else the defaults. */
export function currentReading(): ReadingSettings {
  const stored = loadDeviceReading();
  if (stored) return stored.settings;
  try {
    const a = loadAppearance(deviceStorage());
    return seedFromAppearance({ textSize: a.textSize, font: a.font });
  } catch {
    return withDefaults({});
  }
}

export function announceReading(): void {
  try {
    window.dispatchEvent(new Event(READING_EVENT));
  } catch {
    // the next page load applies it
  }
}

export function applyToPage(s: ReadingSettings): void {
  applyReading(document.documentElement, s);
}
