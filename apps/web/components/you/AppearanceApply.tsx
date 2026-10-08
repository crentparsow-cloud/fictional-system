"use client";

import { useEffect } from "react";
import { APPEARANCE_EVENT, APPEARANCE_KEY, applyAppearance, deviceStorage, loadAppearance } from "@/lib/appearance";

/**
 * Applies the reader's appearance settings to <html> (text size, font, dim
 * at night, reduced motion). Mounted once in the reader shell. Rechecks the
 * clock every few minutes so dimming starts and stops at 9 p.m. and 5 a.m.,
 * and follows changes made on You or in another tab.
 */
export function AppearanceApply() {
  useEffect(() => {
    const apply = () => applyAppearance(document.documentElement, loadAppearance(deviceStorage()), new Date());
    apply();
    const timer = window.setInterval(apply, 5 * 60_000);
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === APPEARANCE_KEY) apply();
    };
    window.addEventListener(APPEARANCE_EVENT, apply);
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(APPEARANCE_EVENT, apply);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return null;
}
