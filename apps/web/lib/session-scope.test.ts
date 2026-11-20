import { describe, expect, it } from "vitest";
import { decodeJwtClaims, isSessionCookieName, scopeDecision, sessionIdOf } from "./session-scope";

const A = "a7300000-0000-0000-0000-0000000000b1";
const B = "a7300000-0000-0000-0000-0000000000b2";
const MARKET = "00000000-0000-0000-0000-00000000000a";

const account = { sub: "u1", role: "authenticated" };
const scopedA = { sub: "u1", role: "tenant_reader", akana_tenant: A };

function jwt(payload: unknown): string {
  const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  return `${enc({ alg: "HS256" })}.${enc(payload)}.sig`;
}

describe("scopeDecision (F-133): every host kind against every token scope", () => {
  it("marketplace: an ordinary session is the account scope, as before", () => {
    expect(scopeDecision({ kind: "marketplace", tenantId: MARKET }, account)).toEqual({ ok: true, scope: "account" });
    // Staff and other roles are not this check's business on the marketplace.
    expect(scopeDecision({ kind: "marketplace", tenantId: MARKET }, { sub: "u1", role: "authenticated", app_metadata: { platform_roles: ["owner"] } })).toEqual({ ok: true, scope: "account" });
    expect(scopeDecision({ kind: "marketplace", tenantId: null }, account)).toEqual({ ok: true, scope: "account" });
  });

  it("marketplace: a tenant token is refused, whatever tenant it names", () => {
    for (const claims of [
      scopedA,
      { sub: "u1", role: "tenant_reader" },
      { sub: "u1", role: "tenant_reader", akana_tenant: MARKET },
      // The role says authenticated but the tenant claim is there: still a tenant token.
      { sub: "u1", role: "authenticated", akana_tenant: A },
      { sub: "u1", role: "authenticated", akana_tenant: null },
      { sub: "u1", role: "authenticated", akana_tenant: "" },
    ]) {
      expect(scopeDecision({ kind: "marketplace", tenantId: MARKET }, claims)).toEqual({ ok: false, reason: "tenant_token_on_marketplace" });
    }
  });

  it("tenant host: only a tenant_reader token for this tenant passes", () => {
    expect(scopeDecision({ kind: "white_label", tenantId: A }, scopedA)).toEqual({ ok: true, scope: "tenant" });
    expect(scopeDecision({ kind: "white_label", tenantId: A.toUpperCase() }, scopedA)).toEqual({ ok: true, scope: "tenant" });
  });

  it("tenant host: an ordinary Akana session is signed out", () => {
    expect(scopeDecision({ kind: "white_label", tenantId: A }, account)).toEqual({ ok: false, reason: "account_token_on_tenant" });
    expect(scopeDecision({ kind: "white_label", tenantId: A }, { sub: "u1", role: "service_role" })).toEqual({ ok: false, reason: "account_token_on_tenant" });
    // Forged: the claim without the role.
    expect(scopeDecision({ kind: "white_label", tenantId: A }, { sub: "u1", role: "authenticated", akana_tenant: A })).toEqual({ ok: false, reason: "account_token_on_tenant" });
    expect(scopeDecision({ kind: "white_label", tenantId: A }, { sub: "u1", akana_tenant: A })).toEqual({ ok: false, reason: "account_token_on_tenant" });
  });

  it("tenant host: a token for another tenant is signed out", () => {
    expect(scopeDecision({ kind: "white_label", tenantId: B }, scopedA)).toEqual({ ok: false, reason: "wrong_tenant" });
    expect(scopeDecision({ kind: "white_label", tenantId: null }, scopedA)).toEqual({ ok: false, reason: "wrong_tenant" });
    expect(scopeDecision({ kind: "white_label", tenantId: "demo" }, scopedA)).toEqual({ ok: false, reason: "wrong_tenant" });
  });

  it("tenant host: a missing or malformed tenant claim is signed out", () => {
    for (const akana_tenant of [undefined, null, "", "not-a-uuid", 42, [A], { id: A }, `${A} `]) {
      expect(scopeDecision({ kind: "white_label", tenantId: A }, { sub: "u1", role: "tenant_reader", akana_tenant })).toEqual({ ok: false, reason: "malformed_claims" });
    }
  });

  it("refuses with no claims and on a host of no known kind", () => {
    expect(scopeDecision({ kind: "marketplace", tenantId: MARKET }, null)).toEqual({ ok: false, reason: "malformed_claims" });
    expect(scopeDecision({ kind: "white_label", tenantId: A }, undefined)).toEqual({ ok: false, reason: "malformed_claims" });
    for (const kind of [null, undefined, "", "staff", "Marketplace"]) {
      expect(scopeDecision({ kind, tenantId: A }, scopedA)).toEqual({ ok: false, reason: "unknown_host" });
      expect(scopeDecision({ kind, tenantId: MARKET }, account)).toEqual({ ok: false, reason: "unknown_host" });
    }
  });
});

describe("decodeJwtClaims", () => {
  it("reads the payload of a token", () => {
    expect(decodeJwtClaims(jwt({ sub: "u1", role: "tenant_reader", akana_tenant: A, name: "Zoë" }))).toEqual({ sub: "u1", role: "tenant_reader", akana_tenant: A, name: "Zoë" });
  });
  it("is null for anything that is not a three-part token with an object payload", () => {
    for (const bad of [null, undefined, "", "abc", "a.b", "a.b.c.d", "a..c", `x.${Buffer.from("[1]").toString("base64url")}.y`, `x.${Buffer.from("null").toString("base64url")}.y`, "x.!!!.y"]) {
      expect(decodeJwtClaims(bad)).toBeNull();
    }
  });
  it("reads the session id only when it is a uuid", () => {
    expect(sessionIdOf({ session_id: A.toUpperCase() })).toBe(A);
    expect(sessionIdOf({ session_id: "x" })).toBeNull();
    expect(sessionIdOf({})).toBeNull();
    expect(sessionIdOf(null)).toBeNull();
  });
});

describe("session cookie names", () => {
  const base = "__Host-akana-auth";
  it("knows the session cookie and its chunks, and leaves the PKCE verifier cookies alone", () => {
    for (const n of [base, `${base}.0`, `${base}.12`]) expect(isSessionCookieName(n, base)).toBe(true);
    for (const n of [`${base}-code-verifier`, `${base}-flows-code-verifier`, `${base}-flow-8e6f-code-verifier`, `${base}.x`, `${base}x`, "akana_signin_email", "other"]) {
      expect(isSessionCookieName(n, base)).toBe(false);
    }
  });
});
