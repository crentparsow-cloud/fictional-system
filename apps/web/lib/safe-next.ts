/**
 * Where a reader may be sent after sign-in or a gate: a path on this site
 * and nothing else.
 *
 * A "next" value arrives in a query string or a form field, so it is
 * attacker-controlled. Browsers and the URL parser strip tabs and newlines
 * and treat a backslash as a slash, so "/<TAB>/evil.example" and
 * "/\evil.example" both become "//evil.example": another site. The rules:
 *
 *   - a string of sensible length, starting with exactly one "/"
 *   - no control character, backslash or line separator anywhere
 *   - not starting with an encoded slash or backslash either
 *   - and, parsed against a fixed origin, it must stay on that origin
 *
 * Anything else is replaced by the fallback. Pure, so it is tested alone
 * (lib/safe-next.test.ts). lib/auth.ts re-exports safeNextPath.
 */
const PROBE_ORIGIN = "https://next.invalid";
// Control characters, backslash, and the two Unicode line separators (U+2028, U+2029).
const FORBIDDEN = new RegExp("[\\x00-\\x1f\\x7f-\\x9f\\\\" + String.fromCharCode(0x2028, 0x2029) + "]");
const MAX_LENGTH = 2048;

export function safeNextPath(next: string | null | undefined, fallback = "/home"): string {
  if (typeof next !== "string" || next.length === 0 || next.length > MAX_LENGTH) return fallback;
  if (FORBIDDEN.test(next)) return fallback;
  if (next[0] !== "/" || next[1] === "/") return fallback;
  if (/^\/(%2f|%5c)/i.test(next)) return fallback;
  try {
    const url = new URL(next, PROBE_ORIGIN);
    if (url.origin !== PROBE_ORIGIN || url.pathname.startsWith("//")) return fallback;
  } catch {
    return fallback;
  }
  return next;
}

/**
 * The absolute URL for a redirect to `next` on `origin`. The result is
 * checked again after parsing: its origin must be `origin` itself, or the
 * fallback path is used. Use this wherever a redirect needs a full URL.
 */
export function sameOriginUrl(next: string | null | undefined, origin: string, fallback = "/home"): URL {
  const base = new URL(origin);
  const url = new URL(safeNextPath(next, fallback), base);
  if (url.origin !== base.origin) return new URL(fallback, base);
  return url;
}
