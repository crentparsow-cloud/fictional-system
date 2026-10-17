"use client";

import { useCallback } from "react";
import { readOnboarding, updateOnboarding, type KeyValueStore } from "@/lib/onboarding";

function local(): KeyValueStore | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Marks the first finished exercise on this device (13.4), once. The
 * membership offer waits for it. Nothing is sent anywhere.
 */
export function useFirstExerciseMark(): () => void {
  return useCallback(() => {
    const store = local();
    if (!store) return;
    if (!readOnboarding(store).firstExerciseAt) updateOnboarding(store, { firstExerciseAt: Date.now() });
  }, []);
}
