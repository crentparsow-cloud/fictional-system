/** True when the reader wants no movement: the device setting, or the Akana switch. Browser only. */
export function prefersCalm(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "reduce";
  } catch {
    return true;
  }
}
