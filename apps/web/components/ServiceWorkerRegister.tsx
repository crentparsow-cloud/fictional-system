"use client";

import { useEffect } from "react";

/**
 * Registers the allowlist service worker (F-140) from bundled code, so no
 * inline script is needed and the CSP stays as it is. The worker only keeps
 * the offline Help now page; see public/sw.js. Registration failing (a
 * private window, an old browser) changes nothing for the reader.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  }, []);
  return null;
}

/** Ask the worker to drop its cache, for example at sign-out. Safe to call anywhere. */
export function clearServiceWorkerCache(): void {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "akana:clear" });
  } catch {
    // nothing to clear
  }
}
