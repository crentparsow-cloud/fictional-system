import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { OFFLINE_HELP_CSS, OFFLINE_HELP_PATH, offlineHelpHtml } from "./offline-help";
import { LAUNCH_MARKETS, MARKETS } from "./markets";

/**
 * F-140: the service worker is an allowlist. This runs public/sw.js in a
 * sandbox with a fake Cache Storage and fetch, drives it through install,
 * online and offline requests, and lists every URL it ever cached.
 */

const SW_SOURCE = readFileSync(resolve(__dirname, "../public/sw.js"), "utf8");
const ORIGIN = "https://akana.example";
const ALLOWLIST = [OFFLINE_HELP_PATH, OFFLINE_HELP_CSS];

type Listener = (event: FakeEvent) => void;
interface FakeEvent {
  request?: FakeRequest;
  data?: unknown;
  respondWith?: (p: Promise<FakeResponse>) => void;
  waitUntil: (p: Promise<unknown>) => void;
}
class FakeRequest {
  url: string;
  method: string;
  mode: string;
  constructor(input: string | FakeRequest, init: { method?: string; mode?: string } = {}) {
    this.url = typeof input === "string" ? new URL(input, ORIGIN).toString() : input.url;
    this.method = init.method ?? "GET";
    this.mode = init.mode ?? "cors";
  }
}
class FakeResponse {
  ok = true;
  type = "basic";
  constructor(public body: string) {}
  clone() {
    return new FakeResponse(this.body);
  }
  static error() {
    const r = new FakeResponse("");
    r.ok = false;
    r.type = "error";
    return r;
  }
}

function boot() {
  const listeners = new Map<string, Listener>();
  const stores = new Map<string, Map<string, FakeResponse>>();
  const cached: string[] = [];
  let online = true;
  const pathOf = (k: string | FakeRequest) => new URL(typeof k === "string" ? k : k.url, ORIGIN).pathname + new URL(typeof k === "string" ? k : k.url, ORIGIN).search;
  const caches = {
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return {
        addAll: async (reqs: (string | FakeRequest)[]) => {
          for (const r of reqs) {
            cached.push(pathOf(r));
            store.set(pathOf(r), new FakeResponse(`cached ${pathOf(r)}`));
          }
        },
        put: async (key: string | FakeRequest, res: FakeResponse) => {
          cached.push(pathOf(key));
          store.set(pathOf(key), res);
        },
      };
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    match: async (key: string | FakeRequest) => {
      for (const s of stores.values()) {
        const hit = s.get(pathOf(key));
        if (hit) return hit;
      }
      return undefined;
    },
  };
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: Listener) => listeners.set(type, fn),
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined },
  };
  const fetchFn = async (req: FakeRequest | string) => {
    if (!online) throw new TypeError("offline");
    return new FakeResponse(`network ${pathOf(req)}`);
  };
  runInNewContext(SW_SOURCE, { self, caches, fetch: fetchFn, Request: FakeRequest, Response: FakeResponse, URL, Promise });

  const fire = async (type: string, init: Partial<FakeEvent> = {}) => {
    const waits: Promise<unknown>[] = [];
    let responded: Promise<FakeResponse> | null = null;
    const event: FakeEvent = { ...init, waitUntil: (p) => waits.push(p), respondWith: (p) => (responded = p) };
    listeners.get(type)?.(event);
    await Promise.all(waits);
    const res = responded ? await responded : null;
    await new Promise((r) => setTimeout(r, 0));
    return res as FakeResponse | null;
  };
  const get = (path: string, mode = "cors") => fire("fetch", { request: new FakeRequest(path, { mode }) });
  return { fire, get, cached, stores, setOnline: (v: boolean) => (online = v) };
}

describe("allowlist service worker (F-140)", () => {
  it("caches only the offline Help now page and its stylesheet, whatever the reader opens", async () => {
    const sw = boot();
    await sw.fire("install");
    await sw.fire("activate");
    for (const path of ["/", "/home", "/today", "/read/focus", "/read/focus?view=daily", "/you", "/library", "/help-now", "/w/focus", "/_next/static/chunks/app.js", "/covers/AK-12345"]) {
      await sw.get(path, path.startsWith("/_next") || path.startsWith("/covers") ? "no-cors" : "navigate");
    }
    await sw.get("/api/answers?enrolment=x");
    await sw.get("/help-offline");
    await sw.get("/help-offline.css");
    // Every URL the worker ever stored:
    expect([...new Set(sw.cached)].sort()).toEqual([...ALLOWLIST].sort());
  });

  it("never caches or serves from cache the network-only paths; offline, a page there still gets Help now", async () => {
    const sw = boot();
    await sw.fire("install");
    const paths = ["/auth/callback?code=x", "/go/focus", "/respond/abc", "/preview/x", "/admin", "/sign-in?next=%2Ftoday"];
    for (const path of paths) {
      expect((await sw.get(path, "navigate"))?.body).toBe(`network ${path}`);
    }
    // API calls and other non-page requests are never touched, online or offline.
    expect(await sw.get("/api/answers?enrolment=x")).toBeNull();
    sw.setOnline(false);
    expect(await sw.get("/api/progress")).toBeNull();
    for (const path of paths) {
      expect((await sw.get(path, "navigate"))?.body).toBe("cached /help-offline");
    }
    expect([...new Set(sw.cached)].sort()).toEqual([...ALLOWLIST].sort());
    // Non-GET requests are never touched.
    expect(await sw.fire("fetch", { request: new FakeRequest("/api/answers", { method: "PUT" }) })).toBeNull();
    // Other origins are never touched.
    expect(await sw.get("https://abc.supabase.co/rest/v1/answers", "cors")).toBeNull();
  });

  it("shows Help now when a page cannot load, and leaves online pages alone", async () => {
    const sw = boot();
    await sw.fire("install");
    const online = await sw.get("/read/focus", "navigate");
    expect(online?.body).toBe("network /read/focus");
    sw.setOnline(false);
    const offline = await sw.get("/read/focus", "navigate");
    expect(offline?.body).toBe("cached /help-offline");
    // A script or image that fails is not swapped for a page.
    expect(await sw.get("/_next/static/chunks/app.js", "no-cors")).toBeNull();
  });

  it("clears its cache when asked, for example at sign-out", async () => {
    const sw = boot();
    await sw.fire("install");
    expect(sw.stores.size).toBe(1);
    await sw.fire("message", { data: { type: "akana:clear" } });
    expect(sw.stores.size).toBe(0);
  });
});

describe("offline Help now page (F-140)", () => {
  const html = offlineHelpHtml();

  it("lists every market's crisis lines as tel: or sms: links", () => {
    for (const code of LAUNCH_MARKETS) {
      expect(html).toContain(`id="m-${code.toLowerCase()}"`);
      expect(html).toContain(MARKETS[code].name);
      for (const line of MARKETS[code].helpNow) {
        expect(html).toContain(line.number);
      }
    }
    expect(html).toContain('href="tel:999"');
    expect(html).toContain('href="tel:116123"');
    expect(html).toContain('href="sms:');
  });

  it("has no script, no inline style and nothing that needs the network", () => {
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/style=/i);
    expect(html).not.toMatch(/<style/i);
    expect(html).toContain(`<link rel="stylesheet" href="${OFFLINE_HELP_CSS}">`);
    expect(html).not.toMatch(/<img|<iframe|https:\/\/fonts\./i);
  });
});
