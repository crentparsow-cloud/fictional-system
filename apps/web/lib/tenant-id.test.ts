import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

import { tenantForHost, tenantIdForHeaders, tenantIdFromHeaders, MARKETPLACE_TENANT_ID } from "@/lib/tenant-id";
import { proxyRequestHeaders, resolveFromConfig, type HostTenant } from "@/lib/tenant-resolve";
import { DEMO_TENANT_ID } from "@/lib/tenant";

/**
 * Review L4. The proxy matcher skips /icons/, /fonts/ and other static
 * paths, so a request there reaches the app with whatever x-akana-* headers
 * the client sent. The helper must not serve it as the tenant they name.
 */
const OTHER = "22222222-2222-4222-8222-222222222222";
const PUBLISHER: HostTenant = { id: "33333333-3333-4333-8333-333333333333", slug: "publisher", kind: "white_label", source: "db" };
const resolver = async (host: string): Promise<HostTenant | null> => (host === "books.publisher.example" ? PUBLISHER : resolveFromConfig(host.split(":")[0] ?? ""));

describe("tenant for a request that did not pass through the proxy", () => {
  it("ignores forged tenant headers on the marketplace host", async () => {
    const forged = new Headers({ host: "localhost:3000", "x-akana-tenant": "publisher", "x-akana-tenant-kind": "white_label", "x-akana-tenant-id": OTHER });
    expect(await tenantIdForHeaders(forged, resolver)).toBe(MARKETPLACE_TENANT_ID);
    expect((await tenantForHost(forged, resolver))?.kind).toBe("marketplace");
  });

  it("ignores a forged marketplace or demo id on a tenant host", async () => {
    const forged = new Headers({ host: "books.publisher.example", "x-akana-tenant": "akana", "x-akana-tenant-id": MARKETPLACE_TENANT_ID });
    expect(await tenantIdForHeaders(forged, resolver)).toBe(PUBLISHER.id);
    const demo = new Headers({ host: "books.publisher.example", "x-akana-tenant": "demo", "x-akana-tenant-id": DEMO_TENANT_ID });
    expect(await tenantIdForHeaders(demo, resolver)).toBe(PUBLISHER.id);
  });

  it("serves no tenant on an unknown host, whatever the headers say", async () => {
    const forged = new Headers({ host: "stray.example", "x-akana-tenant": "akana", "x-akana-tenant-id": MARKETPLACE_TENANT_ID });
    expect(await tenantIdForHeaders(forged, resolver)).toBeNull();
    expect(await tenantIdForHeaders(new Headers({ "x-akana-tenant": "akana", "x-akana-tenant-id": MARKETPLACE_TENANT_ID }), resolver)).toBeNull();
  });

  it("uses the real resolver by default: localhost is the marketplace", async () => {
    const forged = new Headers({ host: "localhost:3000", "x-akana-tenant-id": OTHER });
    expect(await tenantIdForHeaders(forged)).toBe(MARKETPLACE_TENANT_ID);
  });

  it("still refuses a resolver answer whose slug and id disagree", () => {
    expect(tenantIdFromHeaders("akana", OTHER)).toBeNull();
    expect(tenantIdFromHeaders("publisher", null)).toBeNull();
  });
});

describe("the headers the proxy passes on", () => {
  it("drops every inbound x-akana-* header and sets its own", () => {
    const inbound = new Headers({ host: "localhost:3000", cookie: "a=b", "x-akana-tenant": "publisher", "x-akana-tenant-id": OTHER, "X-Akana-Staff": "1", "x-akana-path": "//evil.example" });
    const out = proxyRequestHeaders(inbound, { id: null, slug: "press", kind: "white_label", source: "config" }, "/w/a-title?x=1");
    expect(out.get("x-akana-tenant")).toBe("press");
    expect(out.get("x-akana-tenant-kind")).toBe("white_label");
    expect(out.get("x-akana-tenant-id")).toBeNull();
    expect(out.get("x-akana-staff")).toBeNull();
    expect(out.get("x-akana-path")).toBe("/w/a-title?x=1");
    expect(out.get("cookie")).toBe("a=b");
  });
  it("passes the id the resolver gave", () => {
    const out = proxyRequestHeaders(new Headers({ "x-akana-tenant-id": OTHER }), PUBLISHER, "/");
    expect(out.get("x-akana-tenant-id")).toBe(PUBLISHER.id);
  });
});
