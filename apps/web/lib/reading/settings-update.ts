import { saveReadingSettings } from "./settings-actions";
import { announceReading, applyToPage, currentReading, saveDeviceReading } from "./settings-client";
import { sameSettings, type ReadingSettings } from "./settings";

/**
 * Changes some of the reading settings from outside the Aa panel, for
 * example from the command list. Applies at once, keeps a copy on the device
 * and sends one to the account, as the panel does. Browser only.
 */
export function changeReading(patch: Partial<ReadingSettings>): ReadingSettings {
  const before = currentReading();
  const next = { ...before, ...patch };
  if (sameSettings(before, next)) return before;
  applyToPage(next);
  saveDeviceReading({ settings: next, updatedAt: Date.now() });
  announceReading();
  void saveReadingSettings(next)
    .then((at) => {
      if (at !== null) saveDeviceReading({ settings: next, updatedAt: at });
    })
    .catch(() => undefined);
  return next;
}
