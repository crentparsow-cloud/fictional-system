"use client";

import { useMemo, useSyncExternalStore } from "react";
import { ONBOARDING_KEY, readOnboarding, type OnboardingState } from "@/lib/onboarding";

function subscribeStorage(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function rawOnboarding(): string {
  try {
    return window.localStorage.getItem(ONBOARDING_KEY) ?? "";
  } catch {
    return "";
  }
}

/**
 * The onboarding state kept on this device (lib/onboarding.ts), read the way
 * React wants an outside store read: the server and the first client render
 * see the empty state, then the device's own. No effect, no flash of the
 * wrong screen, no mismatch. A change made in this tab is written by the
 * caller and shown by the caller's own state; another tab's change arrives
 * through the storage event.
 */
export function useOnboardingState(): OnboardingState {
  const raw = useSyncExternalStore(subscribeStorage, rawOnboarding, () => "");
  return useMemo(() => readOnboarding({ getItem: () => (raw === "" ? null : raw), setItem: () => undefined }), [raw]);
}

function subscribeDisplayMode(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const query = window.matchMedia("(display-mode: standalone)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function standaloneNow(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches) || nav.standalone === true;
}

/** True when Akana is open from the home screen rather than a browser tab. */
export function useIsStandalone(): boolean {
  return useSyncExternalStore(subscribeDisplayMode, standaloneNow, () => false);
}
