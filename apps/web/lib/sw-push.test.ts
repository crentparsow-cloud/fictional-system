import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

/** 13.19, 14.7: the push and notification-click handlers in public/sw.js. */
const SW_SOURCE = readFileSync(resolve(__dirname, "../public/sw.js"), "utf8");
const ORIGIN = "https://akana.example";

type Listener = (e: Record<string, unknown>) => void;
type Options = { body?: string; tag?: string; icon?: string; badge?: string; data?: unknown };

function boot(opts: { badge?: boolean; windows?: { url: string }[] } = {}) {
  const listeners = new Map<string, Listener>();
  const shown: { title: string; options: Options }[] = [];
  const badges: number[] = [];
  const opened: string[] = [];
  const navigated: string[] = [];
  const wins = (opts.windows ?? []).map((w) => ({
    url: w.url,
    navigate: async (u: string) => {
      navigated.push(u);
      return { focus: async () => undefined };
    },
    focus: async () => undefined,
  }));
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (t: string, fn: Listener) => listeners.set(t, fn),
    skipWaiting: async () => undefined,
    registration: { showNotification: async (title: string, options: Options) => void shown.push({ title, options }) },
    navigator: opts.badge === false ? {} : { setAppBadge: async (n: number) => void badges.push(n) },
    clients: { claim: async () => undefined, matchAll: async () => wins, openWindow: async (u: string) => void opened.push(u) },
  };
  runInNewContext(SW_SOURCE, { self, caches: {}, fetch: async () => ({}), Request: class {}, Response: class {}, URL, Promise });
  const fire = async (type: string, event: Record<string, unknown> = {}) => {
    const waits: Promise<unknown>[] = [];
    listeners.get(type)?.({ ...event, waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  };
  return { fire, shown, badges, opened, navigated };
}

describe("push in the service worker", () => {
  it("shows one fixed line and sets the badge, whatever the push carries", async () => {
    const sw = boot();
    await sw.fire("push", { data: { text: () => "should never be read" } });
    expect(sw.shown).toHaveLength(1);
    expect(sw.shown[0]!.title).toBe("Akana");
    expect(sw.shown[0]!.options.body).toBe("Your step for today is ready.");
    expect(sw.shown[0]!.options.tag).toBe("daily-step");
    expect(JSON.stringify(sw.shown[0])).not.toMatch(/should never be read/);
    expect(sw.badges).toEqual([1]);
  });
  it("still shows the line where the badge API is missing", async () => {
    const sw = boot({ badge: false });
    await sw.fire("push");
    expect(sw.shown).toHaveLength(1);
    expect(sw.badges).toEqual([]);
  });
  it("opens Today on a tap, in the open window when there is one", async () => {
    const closed: boolean[] = [];
    const fresh = boot();
    await fresh.fire("notificationclick", { notification: { close: () => closed.push(true) } });
    expect(fresh.opened).toEqual([`${ORIGIN}/today/go`]);
    const reuse = boot({ windows: [{ url: `${ORIGIN}/library` }] });
    await reuse.fire("notificationclick", { notification: { close: () => closed.push(true) } });
    expect(reuse.navigated).toEqual([`${ORIGIN}/today/go`]);
    expect(reuse.opened).toEqual([]);
    expect(closed).toHaveLength(2);
  });
});
