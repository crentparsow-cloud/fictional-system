"use client";

import { useEffect } from "react";
import { APPEARANCE_EVENT, APPEARANCE_KEY, applyAppearance, deviceStorage, loadAppearance } from "@/lib/appearance";
import { saveReadingSettings } from "@/lib/reading/settings-actions";
import { announceReading, applyToPage, loadDeviceReading, saveDeviceReading } from "@/lib/reading/settings-client";
import { READING_EVENT, READING_KEY, mergeReading, type StoredReading } from "@/lib/reading/settings";

/**
 * Applies the reader's appearance and reading settings to <html>. Mounted
 * once in the reader shell, in place of AppearanceApply.
 *
 * Dim at night and reduced motion still come from the device (Appearance).
 * Font, size, page colour, margin and progress come from the reading
 * settings: the account copy and the device copy are merged on load and the
 * newer one wins. Until the reader has chosen anything, the older Appearance
 * font and size apply, so nobody loses a choice they already made.
 */
export function ReadingApply({ account }: { account: StoredReading | null }) {
  useEffect(() => {
    const apply = () => {
      applyAppearance(document.documentElement, loadAppearance(deviceStorage()), new Date());
      const stored = loadDeviceReading();
      if (stored) applyToPage(stored.settings);
    };
    apply();

    // Merge once per load. The newer copy wins; the older side is brought up to date.
    const device = loadDeviceReading();
    const merged = mergeReading(device, account);
    if (merged.source !== "none") {
      const winner: StoredReading = merged.source === "account" && account ? account : device!;
      if (merged.pullToDevice || !device) {
        saveDeviceReading(winner);
        announceReading();
      }
      if (merged.pushToAccount) {
        void saveReadingSettings(merged.settings)
          .then((at) => {
            // Take the server's time, so the two copies agree on when this was saved.
            if (at !== null) saveDeviceReading({ settings: merged.settings, updatedAt: at });
          })
          .catch(() => undefined);
      }
    }
    apply();

    const timer = window.setInterval(apply, 5 * 60_000);
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === APPEARANCE_KEY || e.key === READING_KEY) apply();
    };
    window.addEventListener(APPEARANCE_EVENT, apply);
    window.addEventListener(READING_EVENT, apply);
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(APPEARANCE_EVENT, apply);
      window.removeEventListener(READING_EVENT, apply);
      window.removeEventListener("storage", onStorage);
    };
    // The account copy is read once per page load, from the server.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

