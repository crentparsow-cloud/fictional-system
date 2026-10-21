/** Small pure helpers for the push toggle (13.19). */

export function urlBase64ToBytes(b64: string): Uint8Array {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function bytesToBase64Url(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export type PushSupport = "unsupported" | "needs_install" | "ready";

/** Push needs a service worker, the Push API and notifications. On iPhone and iPad it only works for the installed app. */
export function pushSupport(env: { hasServiceWorker: boolean; hasPush: boolean; hasNotification: boolean; installed: boolean; isApple: boolean }): PushSupport {
  if (!env.hasServiceWorker || !env.hasPush || (!env.hasNotification && !env.isApple)) return env.isApple && !env.installed ? "needs_install" : "unsupported";
  if (env.isApple && !env.installed) return "needs_install";
  return "ready";
}
