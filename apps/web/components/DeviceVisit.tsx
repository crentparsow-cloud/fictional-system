"use client";

import { useLayoutEffect } from "react";
import { recordVisit } from "@/lib/onboarding";

/**
 * Counts one visit per browsing session on this device (13.4, 10.1, 13.18),
 * so the membership offer, the install prompt and the iOS guide can wait for
 * the second one. The count is a number in localStorage. It is never sent
 * anywhere and carries nothing about what was read.
 */
export function DeviceVisit() {
  useLayoutEffect(() => {
    try {
      recordVisit(window.localStorage, window.sessionStorage);
    } catch {
      // storage blocked: nothing is counted, so nothing timed on a visit ever shows
    }
  }, []);
  return null;
}
