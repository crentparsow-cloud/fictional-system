import { afterEach, describe, expect, it, vi } from "vitest";
import { clearTenantCache } from "./tenant-resolve";

const DEPS = { supabaseUrl: "https://example.supabase.co", publishableKey: "sb_publishable_test" };

function okRows(rows: unknown[]) {
  return vi.fn(async () => new Response(JSON.stringify(rows), { status: 200 }));
}

describe("demo tenant hosts (F-074)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    clearTenantCache();
  });

  it("serves demo.localhost and listed hosts as the demo tenant with its fixed id", async () => {
    vi.stubEnv("DEMO_TENANT_HOSTS", "Akana-Demo-Site.vercel.app, ,bad host");
    vi.resetModules();
    const t = await import("./tenant");
    const r = await import("./tenant-resolve");
    const demo = { id: t.DEMO_TENANT_ID, slug: "demo", kind: "white_label" };
    expect(r.resolveFromConfig("demo.localhost:3000")).toMatchObject(demo);
    expect(r.resolveFromConfig("akana-demo-site.vercel.app")).toMatchObject(demo);
    // Other previews stay the marketplace.
    expect(r.resolveFromConfig("akana-git-main.vercel.app")).toMatchObject({ slug: "akana" });
    const f = okRows([]);
    expect(await r.resolveTenantFromDb("demo.localhost", { ...DEPS, fetchImpl: f })).toMatchObject({ ...demo, source: "config" });
    expect(f).not.toHaveBeenCalled();
  });

  it("gives demo.<TENANT_APEX> the fixed id too", async () => {
    vi.stubEnv("TENANT_APEX", "akana-sites.example");
    vi.resetModules();
    const t = await import("./tenant");
    const r = await import("./tenant-resolve");
    expect(r.resolveFromConfig("demo.akana-sites.example")).toMatchObject({ id: t.DEMO_TENANT_ID, slug: "demo" });
    expect(r.resolveFromConfig("penguin.akana-sites.example")).toMatchObject({ id: null, slug: "penguin" });
  });
});

describe("tenantSiteRoute (F-068, F-069)", () => {
  it("rewrites the home and workbook pages to the tenant site", async () => {
    const { tenantSiteRoute } = await import("./tenant-resolve");
    expect(tenantSiteRoute("/")).toEqual({ action: "rewrite", to: "/site" });
    expect(tenantSiteRoute("/w/quillmoor-ten-minute-desk")).toEqual({ action: "rewrite", to: "/site/w/quillmoor-ten-minute-desk" });
    expect(tenantSiteRoute("/w/Bad_Slug")).toEqual({ action: "not_found" });
  });

  it("serves Akana's locked pages as they are", async () => {
    const { tenantSiteRoute } = await import("./tenant-resolve");
    for (const p of ["/help-now", "/help-offline", "/legal/privacy", "/legal/terms", "/tenant.css", "/covers/AK-DEM01", "/brand/demo/logo-a.svg", "/api/health"]) {
      expect(tenantSiteRoute(p)).toEqual({ action: "serve" });
    }
  });

  it("404s everything else, the marketplace's pages and /site included", async () => {
    const { tenantSiteRoute, isTenantSiteInternalPath } = await import("./tenant-resolve");
    for (const p of ["/library", "/sign-in", "/read/x", "/publish", "/pricing", "/site", "/site/w/x", "/legal", "/api/checkout", "/authors/x"]) {
      expect(tenantSiteRoute(p)).toEqual({ action: "not_found" });
    }
    expect(isTenantSiteInternalPath("/site")).toBe(true);
    expect(isTenantSiteInternalPath("/site/w/x")).toBe(true);
    expect(isTenantSiteInternalPath("/sitemap.xml")).toBe(false);
  });
});

describe("tenantSiteRoute with reader sign-in (F-133)", () => {
  const READER = ["/sign-in", "/welcome", "/consent", "/my-workbooks", "/account"];

  it("flag off, or not stated: every sign-in and reader route is a 404, as before", async () => {
    const { tenantSiteRoute } = await import("./tenant-resolve");
    for (const p of [...READER, "/read/quillmoor-ten-minute-desk", "/api/answers", "/api/progress", "/api/session"]) {
      expect(tenantSiteRoute(p)).toEqual({ action: "not_found" });
      expect(tenantSiteRoute(p, {})).toEqual({ action: "not_found" });
      expect(tenantSiteRoute(p, { signIn: false })).toEqual({ action: "not_found" });
      expect(tenantSiteRoute(p, { signIn: "1" as unknown as boolean })).toEqual({ action: "not_found" });
    }
  });

  it("flag on: the reader routes are rewritten to the tenant site and marked as session routes", async () => {
    const { tenantSiteRoute } = await import("./tenant-resolve");
    for (const p of READER) {
      expect(tenantSiteRoute(p, { signIn: true })).toEqual({ action: "rewrite", to: `/site${p}`, session: true });
    }
    expect(tenantSiteRoute("/read/quillmoor-ten-minute-desk", { signIn: true })).toEqual({ action: "rewrite", to: "/site/read/quillmoor-ten-minute-desk", session: true });
    expect(tenantSiteRoute("/api/answers", { signIn: true })).toEqual({ action: "serve", session: true });
    expect(tenantSiteRoute("/api/progress", { signIn: true })).toEqual({ action: "serve", session: true });
  });

  it("flag on: the catalogue and the locked pages are unchanged and carry no session", async () => {
    const { tenantSiteRoute } = await import("./tenant-resolve");
    expect(tenantSiteRoute("/", { signIn: true })).toEqual({ action: "rewrite", to: "/site" });
    expect(tenantSiteRoute("/w/quillmoor-ten-minute-desk", { signIn: true })).toEqual({ action: "rewrite", to: "/site/w/quillmoor-ten-minute-desk" });
    for (const p of ["/help-now", "/legal/privacy", "/tenant.css", "/covers/AK-DEM01"]) {
      expect(tenantSiteRoute(p, { signIn: true })).toEqual({ action: "serve" });
    }
  });

  it("flag on: everything else is still a 404 (default deny)", async () => {
    const { tenantSiteRoute } = await import("./tenant-resolve");
    for (const p of [
      "/site", "/site/sign-in", "/site/read/x", "/home", "/today", "/you", "/toolkit", "/library", "/pricing", "/terms", "/verify", "/sign-out",
      "/read", "/read/Bad_Slug", "/read/x/y", "/sign-in/x", "/auth", "/auth/callback", "/auth/confirm", "/auth/google", "/account/delete", "/consent/faith",
      "/api/session", "/api/checkout", "/api/membership", "/api/export", "/api/marks", "/api/then-now", "/api/friends", "/api/push", "/api/today",
      "/api/account", "/api/answers/x", "/api/progress/x", "/api/stripe/webhook", "/admin", "/studio", "/console", "/org", "/gift", "/friend",
    ]) {
      expect(tenantSiteRoute(p, { signIn: true })).toEqual({ action: "not_found" });
    }
  });
});

describe("tenantSignInEnabled (F-133)", () => {
  const tenant = { id: "a7300000-0000-0000-0000-0000000000b1", kind: "white_label" as const };
  const deps = (body: unknown, ok = true) => {
    const fetchImpl = vi.fn(async () => ({ ok, status: ok ? 200 : 500, json: async () => body }) as unknown as Response);
    return { fetchImpl: fetchImpl as unknown as typeof fetch, supabaseUrl: "https://db.example", publishableKey: "pk", calls: fetchImpl };
  };

  it("is off, with no lookup, while the deployment switch is unset", async () => {
    vi.stubEnv("TENANT_SIGN_IN", "");
    const r = await import("./tenant-resolve");
    r.clearTenantSignInCache();
    const d = deps(true);
    expect(await r.tenantSignInEnabled(tenant, d)).toBe(false);
    expect(d.calls).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("asks the database once per minute and takes only a literal true", async () => {
    vi.stubEnv("TENANT_SIGN_IN", "1");
    const r = await import("./tenant-resolve");
    r.clearTenantSignInCache();
    const on = deps(true);
    expect(await r.tenantSignInEnabled(tenant, on)).toBe(true);
    expect(await r.tenantSignInEnabled(tenant, on)).toBe(true);
    expect(on.calls).toHaveBeenCalledTimes(1);
    const [url, init] = on.calls.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://db.example/rest/v1/rpc/tenant_sign_in_enabled");
    expect(JSON.parse(String(init.body))).toEqual({ p_tenant: tenant.id });
    for (const body of [false, null, "true", 1, { enabled: true }, [true]]) {
      r.clearTenantSignInCache();
      expect(await r.tenantSignInEnabled(tenant, deps(body))).toBe(false);
    }
    vi.unstubAllEnvs();
  });

  it("is off for the marketplace, a tenant with no id, a failed lookup and a thrown fetch", async () => {
    vi.stubEnv("TENANT_SIGN_IN", "1");
    const r = await import("./tenant-resolve");
    r.clearTenantSignInCache();
    const d = deps(true);
    expect(await r.tenantSignInEnabled(null, d)).toBe(false);
    expect(await r.tenantSignInEnabled({ id: tenant.id, kind: "marketplace" }, d)).toBe(false);
    expect(await r.tenantSignInEnabled({ id: null, kind: "white_label" }, d)).toBe(false);
    expect(await r.tenantSignInEnabled({ id: "demo", kind: "white_label" }, d)).toBe(false);
    expect(d.calls).not.toHaveBeenCalled();
    expect(await r.tenantSignInEnabled(tenant, deps(true, false))).toBe(false);
    r.clearTenantSignInCache();
    const boom = { fetchImpl: (async () => { throw new Error("down"); }) as unknown as typeof fetch, supabaseUrl: "https://db.example", publishableKey: "pk" };
    expect(await r.tenantSignInEnabled(tenant, boom)).toBe(false);
    r.clearTenantSignInCache();
    expect(await r.tenantSignInEnabled(tenant, { supabaseUrl: "", publishableKey: "" })).toBe(false);
    vi.unstubAllEnvs();
  });
});
