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
