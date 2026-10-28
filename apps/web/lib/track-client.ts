import type { ClientEvent } from "@/lib/product-events";

/**
 * Tell the server a moment happened in the browser: the event name and
 * nothing else. Best effort, never throws, never waits. The server honours
 * the visitor's opt-out (Global Privacy Control, Do Not Track, /counting).
 */
export function trackClientEvent(event: ClientEvent): void {
  try {
    if (typeof fetch !== "function") return;
    void fetch("/api/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event }),
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => undefined);
  } catch {
    // counting is never worth a broken page
  }
}
