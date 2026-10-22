"use client";

import { useEffect } from "react";

/**
 * The app badge (14.7): "1" on the installed app's icon while a step is
 * waiting today, cleared when it is done. The Badging API needs no
 * permission. It does nothing where the browser lacks it, and the page passes
 * 0 for readers on mental health shelves, so nothing counts there. The count
 * is a step, never a day or a streak.
 */
export function AppBadge({ count }: { count: number }) {
  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    try {
      if (count > 0 && typeof nav.setAppBadge === "function") void nav.setAppBadge(count).catch(() => undefined);
      else if (typeof nav.clearAppBadge === "function") void nav.clearAppBadge().catch(() => undefined);
    } catch {
      // unsupported: nothing to show
    }
  }, [count]);
  return null;
}
