import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MARKETPLACE_TENANT_ID, normaliseHost, resolveTenant } from "./tenant";
import {
  LOOKUP_TIMEOUT_MS,
  NEGATIVE_TTL_MS,
  POSITIVE_TTL_MS,
  clearTenantCache,
  resolveRequestTenant,
  resolveTenantFromDb,
  routeDecision,
  type HostTenant,
} from "./tenant-resolve";

describe("resolveTenant", () => {
  it("treats localhost and Vercel previews as the marketplace", () => {
    expect(resolveTenant("localhost:3000")).toEqual({ slug: "akana", kind: "marketplace" });
    expect(resolveTenant("akana-git-main-crentparsow.vercel.app")).toEqual({ slug: "akana", kind: "marketplace" });
  });

  it("returns null for an unknown host", () => {
    expect(resolveTenant("evil.example.com")).toBeNull();
    expect(resolveTenant("")).toBeNull();
  });
});

describe("normaliseHost", () => {
  it("lower-cases, strips the port and trailing dots", () => {
    expect(normaliseHost("Books.Example.COM")).toBe("books.example.com");
    expect(normaliseHost("books.example.com:443")).toBe("books.example.com");
    expect(normaliseHost("books.example.com.")).toBe("books.example.com");
    expect(normaliseHost("  BOOKS.example.com.:8080 ")).toBe("books.example.com");
    expect(normaliseHost("LOCALHOST.:3000")).toBe("localhost");
  });

  it("keeps IPv6 brackets and drops the port", () => {
    expect(normaliseHost("[::1]:3000")).toBe("[::1]");
  });

  it("rejects anything that is not a plausible host", () => {
    expect(normaliseHost("")).toBe("");
    expect(normaliseHost("a..b")).toBe("");
    expect(normaliseHost("ev il.com")).toBe("");
    expect(normaliseHost("x/y.com")).toBe("");
    expect(normaliseHost("a".repeat(254))).toBe("");
    expect(normaliseHost("[::1")).toBe("");
  });
});

describe("config apex hosts", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("maps the Akana apex, www, and tenant subdomains, whatever the case", async () => {
    vi.stubEnv("AKANA_HOST", "Akana.example");
    vi.stubEnv("TENANT_APEX", "akana-sites.example");
    vi.resetModules();
    const t = await import("./tenant");
    expect(t.resolveTenant("AKANA.example.")).toEqual({ slug: "akana", kind: "marketplace" });
    expect(t.resolveTenant("www.akana.example:443")).toEqual({ slug: "akana", kind: "marketplace" });
    expect(t.resolveTenant("Penguin.Akana-Sites.example")).toEqual({ slug: "penguin", kind: "white_label" });
    expect(t.resolveTenant("www.akana-sites.example")).toBeNull();
    expect(t.resolveTenant("akana-sites.example")).toBeNull();
  });
});

const TENANT_ID = "11111111-2222-4333-8444-555555555555";
const DEPS = { supabaseUrl: "https://example.supabase.co", publishableKey: "sb_publishable_test" };

function okRows(rows: unknown[]) {
  return vi.fn(async () => new Response(JSON.stringify(rows), { status: 200 }));
}

const tenantRow = { id: TENANT_ID, slug: "penguin", kind: "white_label", status: "active", tenant_domains: [{ host: "books.penguin.example" }] };

describe("resolveTenantFromDb", () => {
  beforeEach(() => {
    clearTenantCache();
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("resolves the marketplace hosts without a lookup", async () => {
    const f = okRows([]);
    const t = await resolveTenantFromDb("localhost:3000", { ...DEPS, fetchImpl: f });
    expect(t).toEqual({ id: MARKETPLACE_TENANT_ID, slug: "akana", kind: "marketplace", source: "config" });
    expect(f).not.toHaveBeenCalled();
  });

  it("queries verified domains by exact normalised host with the publishable key", async () => {
    const f = okRows([tenantRow]);
    const t = await resolveTenantFromDb("Books.Penguin.Example.:443", { ...DEPS, fetchImpl: f });
    expect(t).toEqual({ id: TENANT_ID, slug: "penguin", kind: "white_label", source: "db" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/rest/v1/tenants?select=id,slug,kind,status,tenant_domains!inner(host)");
    expect(url).toContain("tenant_domains.host=eq.books.penguin.example");
    expect(url).toContain("tenant_domains.verified_at=not.is.null");
    expect((init.headers as Record<string, string>).apikey).toBe("sb_publishable_test");
  });

  it("serves a hit from cache and looks up again after the TTL", async () => {
    const f = okRows([tenantRow]);
    await resolveTenantFromDb("books.penguin.example", { ...DEPS, fetchImpl: f });
    vi.advanceTimersByTime(POSITIVE_TTL_MS - 1);
    await resolveTenantFromDb("BOOKS.penguin.example", { ...DEPS, fetchImpl: f });
    expect(f).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2);
    await resolveTenantFromDb("books.penguin.example", { ...DEPS, fetchImpl: f });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("caches a miss for the shorter TTL", async () => {
    const f = okRows([]);
    expect(await resolveTenantFromDb("nobody.example", { ...DEPS, fetchImpl: f })).toBeNull();
    vi.advanceTimersByTime(NEGATIVE_TTL_MS - 1);
    expect(await resolveTenantFromDb("nobody.example", { ...DEPS, fetchImpl: f })).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2);
    await resolveTenantFromDb("nobody.example", { ...DEPS, fetchImpl: f });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("treats suspended tenants and malformed rows as unknown", async () => {
    expect(await resolveTenantFromDb("a.example", { ...DEPS, fetchImpl: okRows([{ ...tenantRow, status: "suspended" }]) })).toBeNull();
    expect(await resolveTenantFromDb("b.example", { ...DEPS, fetchImpl: okRows([{ ...tenantRow, id: "not-a-uuid" }]) })).toBeNull();
  });

  it("falls back to the config map when the lookup times out, and logs it", async () => {
    const f = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const p = resolveTenantFromDb("akana-git-x.vercel.app.evil", { ...DEPS, fetchImpl: f as unknown as typeof fetch });
    await vi.advanceTimersByTimeAsync(LOOKUP_TIMEOUT_MS);
    expect(await p).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("timed out"));
  });

  it("falls back on an HTTP error and holds the fallback briefly", async () => {
    const f = vi.fn(async () => new Response("denied", { status: 401 }));
    // An unknown host stays unknown in fallback: the config map does not know it either.
    expect(await resolveTenantFromDb("books.penguin.example", { ...DEPS, fetchImpl: f })).toBeNull();
    await resolveTenantFromDb("books.penguin.example", { ...DEPS, fetchImpl: f });
    expect(f).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("HTTP 401"));
  });

  it("falls back when Supabase is not configured", async () => {
    const f = okRows([tenantRow]);
    expect(await resolveTenantFromDb("books.penguin.example", { supabaseUrl: "", publishableKey: "", fetchImpl: f })).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("shares one lookup between concurrent requests for a host", async () => {
    const f = okRows([tenantRow]);
    await Promise.all([1, 2, 3].map(() => resolveTenantFromDb("books.penguin.example", { ...DEPS, fetchImpl: f })));
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("fallback to a config tenant", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("returns the TENANT_APEX slug with no id when the database is down", async () => {
    vi.stubEnv("TENANT_APEX", "akana-sites.example");
    vi.resetModules();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await import("./tenant-resolve");
    const f = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const t = await r.resolveTenantFromDb("penguin.akana-sites.example", { ...DEPS, fetchImpl: f });
    expect(t).toEqual({ id: null, slug: "penguin", kind: "white_label", source: "fallback" });
  });
});

describe("resolveRequestTenant", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    clearTenantCache();
  });

  it("uses the config map unless TENANT_DB_LOOKUP=1", async () => {
    const f = okRows([tenantRow]);
    expect(await resolveRequestTenant("books.penguin.example", { ...DEPS, fetchImpl: f })).toBeNull();
    expect(f).not.toHaveBeenCalled();
    vi.stubEnv("TENANT_DB_LOOKUP", "1");
    expect(await resolveRequestTenant("books.penguin.example", { ...DEPS, fetchImpl: f })).toMatchObject({ id: TENANT_ID });
  });
});

describe("routeDecision", () => {
  const market: HostTenant = { id: MARKETPLACE_TENANT_ID, slug: "akana", kind: "marketplace", source: "config" };
  const tenant: HostTenant = { id: TENANT_ID, slug: "penguin", kind: "white_label", source: "db" };

  it("404s an unknown host on every path", () => {
    expect(routeDecision(null, "/")).toBe("not_found");
    expect(routeDecision(null, "/library")).toBe("not_found");
  });

  it("404s staff paths on a tenant host but serves them on the marketplace", () => {
    for (const p of ["/admin", "/admin/tenants", "/studio", "/console/x"]) {
      expect(routeDecision(tenant, p)).toBe("not_found");
      expect(routeDecision(market, p)).toBe("serve");
    }
    expect(routeDecision(tenant, "/administration")).toBe("serve");
    expect(routeDecision(tenant, "/library")).toBe("serve");
  });
});
