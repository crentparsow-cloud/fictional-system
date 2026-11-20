import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => ({ get: (k: string) => hdr[k] ?? null }) }));
vi.mock("@/lib/session-scope-server", () => ({ getScopedUser: async () => scoped }));
vi.mock("@/lib/supabase/anon", () => ({ createAnonClient: () => anon }));

const A = "a7300000-0000-0000-0000-0000000000b1";
const B = "a7300000-0000-0000-0000-0000000000b2";
let hdr: Record<string, string> = {};
let scoped: unknown = null;
let anon: unknown = {};
const onA = { "x-akana-tenant-kind": "white_label", "x-akana-tenant-id": A, "x-akana-tenant-host": "books.a.example", "x-akana-tenant-sign-in": "1" };

describe("tenant reader helpers (F-133)", () => {
  it("the tenant, host and flag come only from the proxy's headers", async () => {
    const { tenantRequest } = await import("./tenant-reader");
    hdr = onA;
    expect(await tenantRequest()).toEqual({ tenantId: A, host: "books.a.example", signIn: true });
    hdr = { ...onA, "x-akana-tenant-sign-in": "true" };
    expect((await tenantRequest())?.signIn).toBe(false);
    for (const bad of [
      { ...onA, "x-akana-tenant-kind": "marketplace" },
      { ...onA, "x-akana-tenant-id": "demo" },
      { ...onA, "x-akana-tenant-host": "" },
      { ...onA, "x-akana-tenant-host": "evil.example/path" },
      { ...onA, "x-akana-tenant-host": "books.a.example:8080" },
      {},
    ]) {
      hdr = bad;
      expect(await tenantRequest()).toBeNull();
    }
  });

  it("asks for the adults-only confirmation first, then the current terms, then nothing", async () => {
    const { nextTenantGate, tenantGateHref } = await import("./tenant-reader");
    expect(nextTenantGate({ adultConfirmed: false, termsAccepted: true })).toBe("welcome");
    expect(nextTenantGate({ adultConfirmed: false, termsAccepted: false })).toBe("welcome");
    expect(nextTenantGate({ adultConfirmed: true, termsAccepted: false })).toBe("terms");
    expect(nextTenantGate({ adultConfirmed: true, termsAccepted: true })).toBeNull();
    expect(tenantGateHref("/read/a-b")).toBe("/welcome?next=%2Fread%2Fa-b");
  });

  it("gates that cannot be read are null, and an unknown deletion state is read only", async () => {
    const { loadTenantGates } = await import("./tenant-reader");
    type Client = Parameters<typeof loadTenantGates>[0];
    const client = (answer: unknown) => ({ rpc: async () => answer }) as unknown as Client;
    expect(await loadTenantGates(client({ data: null, error: { code: "42501" } }))).toBeNull();
    expect(await loadTenantGates(client({ data: [], error: null }))).toBeNull();
    expect(await loadTenantGates({ rpc: async () => { throw new Error("down"); } } as unknown as Client)).toBeNull();
    const row = { adult_confirmed: true, terms_accepted: true, health_consent: true };
    expect(await loadTenantGates(client({ data: [{ ...row, can_write: true }], error: null }))).toEqual({ adultConfirmed: true, termsAccepted: true, healthConsent: true, readOnly: false });
    expect((await loadTenantGates(client({ data: [{ ...row, can_write: false }], error: null })))?.readOnly).toBe(true);
    expect((await loadTenantGates(client({ data: [{ ...row, can_write: null }], error: null })))?.readOnly).toBe(true);
    expect((await loadTenantGates(client({ data: [row], error: null })))?.readOnly).toBe(true);
    // Anything that is not a plain true is the closed answer.
    expect(await loadTenantGates(client({ data: [{ adult_confirmed: null, terms_accepted: "yes", health_consent: 1, can_write: "true" }], error: null }))).toEqual({
      adultConfirmed: false,
      termsAccepted: false,
      healthConsent: false,
      readOnly: true,
    });
  });

  it("R2-6: the gates carry nothing about faith consent or why the account is read only, whatever the database sends", async () => {
    const { loadTenantGates } = await import("./tenant-reader");
    type Client = Parameters<typeof loadTenantGates>[0];
    const leaky = { adult_confirmed: true, terms_accepted: true, health_consent: true, can_write: false, faith_consent: true, read_only: true, deletion_due: "2026-12-01" };
    const gates = await loadTenantGates({ rpc: async () => ({ data: [leaky], error: null }) } as unknown as Client);
    expect(Object.keys(gates ?? {}).sort()).toEqual(["adultConfirmed", "healthConsent", "readOnly", "termsAccepted"]);
    const sql = (await import("node:fs")).readFileSync(new URL("../../../supabase/migrations/0073_tenant_sign_in.sql", import.meta.url), "utf8");
    expect(sql).toContain("returns table (adult_confirmed boolean, terms_accepted boolean, health_consent boolean, can_write boolean)");
  });

  it("R2-6: a tenant answer write never has faith consent, so a faith workbook is refused", async () => {
    const { tenantAnswerFacts } = await import("./tenant-reader");
    type Client = Parameters<typeof tenantAnswerFacts>[0];
    const row = { adult_confirmed: true, terms_accepted: true, health_consent: true, can_write: true, faith_consent: true };
    anon = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { safety_tier: "standard", genre_id: null, themes: null }, error: null }) }) }) }) };
    const facts = await tenantAnswerFacts({ rpc: async () => ({ data: [row], error: null }) } as unknown as Client, "w1");
    expect(facts?.readOnly).toBe(false);
    expect(facts?.profile.health_consent_at).not.toBeNull();
    expect(facts?.profile.faith_consent_at).toBeNull();
    expect(facts?.profile.faith_consent_version).toBeNull();
  });

  it("R2-1, R2-3: a refused write is mapped to the Akana site, and says no more", async () => {
    const { tenantWriteErrorCode } = await import("./tenant-reader");
    expect(tenantWriteErrorCode("AKH09")).toBe("akana");
    expect(tenantWriteErrorCode("AKR01")).toBe("readonly");
    for (const other of ["42501", "23514", "", undefined, null]) expect(tenantWriteErrorCode(other)).toBe("save");
  });

  it("there is a tenant reader only with the flag on and a session scoped to this very tenant", async () => {
    const { getTenantReader } = await import("./tenant-reader");
    const session = (tenantId: string, scope = "tenant") => ({ user: { id: "u1", email: "r@example.com" }, scope, tenantId, supabase: {} });
    hdr = onA;
    scoped = session(A);
    expect(await getTenantReader()).toMatchObject({ userId: "u1", email: "r@example.com", tenantId: A, host: "books.a.example" });
    scoped = session(B);
    expect(await getTenantReader()).toBeNull();
    scoped = session(A, "account");
    expect(await getTenantReader()).toBeNull();
    scoped = null;
    expect(await getTenantReader()).toBeNull();
    scoped = session(A);
    hdr = { ...onA, "x-akana-tenant-sign-in": "" };
    expect(await getTenantReader()).toBeNull();
    hdr = { ...onA, "x-akana-tenant-kind": "marketplace" };
    expect(await getTenantReader()).toBeNull();
  });
});

describe("consent versions: the app and migration 0073 agree (F-133)", () => {
  it("app_config in 0073 holds the versions the app records", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { HEALTH_CONSENT_VERSION, FAITH_CONSENT_VERSION } = await import("./consent");
    const sql = readFileSync(join(__dirname, "..", "..", "..", "supabase", "migrations", "0073_tenant_sign_in.sql"), "utf8");
    // The tenant gate functions take the current version only, and read it from app_config.
    // When a consent version changes, a migration must update these rows in the same release.
    expect(sql).toContain(`('health_consent_version', '"${HEALTH_CONSENT_VERSION}"'::jsonb)`);
    expect(sql).toContain(`('faith_consent_version', '"${FAITH_CONSENT_VERSION}"'::jsonb)`);
  });
});
