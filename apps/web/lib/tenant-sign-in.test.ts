import { describe, expect, it } from "vitest";
import { completeTenantSignIn, tenantSignInErrorCode, type TenantSignInDeps } from "./tenant-sign-in";

const A = "a7300000-0000-0000-0000-0000000000b1";
const B = "a7300000-0000-0000-0000-0000000000b2";
const SID = "a7300000-0000-0000-0000-000000005e01";
const USER = "a7300000-0000-0000-0000-000000000001";

function jwt(payload: unknown): string {
  const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  return `${enc({ alg: "HS256" })}.${enc(payload)}.sig`;
}

const first = jwt({ sub: USER, role: "authenticated", session_id: SID });
const scoped = jwt({ sub: USER, role: "tenant_reader", akana_tenant: A, session_id: SID });

/** A mocked Supabase: records the order of every effect. */
function harness(over: Partial<TenantSignInDeps> = {}) {
  const calls: string[] = [];
  const registered: unknown[] = [];
  const committed: unknown[] = [];
  const deps: TenantSignInDeps = {
    tenantId: A,
    host: "books.a.example",
    establish: async () => {
      calls.push("establish");
      return { accessToken: first, userId: USER, hasVerifiedFactor: false };
    },
    registerScope: async (row) => {
      calls.push("register");
      registered.push(row);
      return true;
    },
    refresh: async () => {
      calls.push("refresh");
      return scoped;
    },
    verify: async () => {
      calls.push("verify");
      return USER;
    },
    signOut: async () => {
      calls.push("signOut");
    },
    commit: async (session) => {
      calls.push("commit");
      committed.push(session);
      return true;
    },
    ...over,
  };
  const wrap = <K extends keyof TenantSignInDeps>(k: K) => {
    if (!over[k]) return;
    const fn = over[k] as (...a: unknown[]) => Promise<unknown>;
    (deps as unknown as Record<string, unknown>)[k] = async (...a: unknown[]) => {
      calls.push(k === "registerScope" ? "register" : k);
      return fn(...a);
    };
  };
  (["establish", "registerScope", "refresh", "verify", "signOut", "commit"] as const).forEach(wrap);
  return { deps, calls, registered, committed };
}

describe("completeTenantSignIn (F-133)", () => {
  it("registers the scope, refreshes and checks before any cookie is written", async () => {
    const h = harness();
    expect(await completeTenantSignIn(h.deps)).toEqual({ ok: true });
    expect(h.calls).toEqual(["establish", "register", "refresh", "verify", "commit"]);
    expect(h.registered).toEqual([{ sessionId: SID, userId: USER, tenantId: A, host: "books.a.example" }]);
    expect(h.committed).toEqual([{ sessionId: SID, userId: USER }]);
  });

  it("no session could be made: nothing is written and there is nothing to sign out", async () => {
    const h = harness({ establish: async () => null });
    expect(await completeTenantSignIn(h.deps)).toEqual({ ok: false, reason: "establish" });
    expect(h.calls).toEqual(["establish"]);
  });

  it("the store refuses (no key, database down): sign out, and the browser gets nothing", async () => {
    const h = harness({ commit: async () => false });
    expect(await completeTenantSignIn(h.deps)).toEqual({ ok: false, reason: "store" });
    expect(h.calls).toEqual(["establish", "register", "refresh", "verify", "commit", "signOut"]);
    const thrown = harness({ commit: async () => { throw new Error("down"); } });
    expect(await completeTenantSignIn(thrown.deps)).toEqual({ ok: false, reason: "error" });
    expect(thrown.calls.at(-1)).toBe("signOut");
  });

  it("hook not enabled: the refreshed token is unscoped, so sign out and write no cookie", async () => {
    const h = harness({ refresh: async () => jwt({ sub: USER, role: "authenticated", session_id: SID }) });
    expect(await completeTenantSignIn(h.deps)).toEqual({ ok: false, reason: "not_scoped" });
    expect(h.calls).toEqual(["establish", "register", "refresh", "signOut"]);
    expect(h.calls).not.toContain("commit");
  });

  it("refuses a refreshed token for another tenant, another user, another session, or with the claim but not the role", async () => {
    for (const payload of [
      { sub: USER, role: "tenant_reader", akana_tenant: B, session_id: SID },
      { sub: "a7300000-0000-0000-0000-000000000002", role: "tenant_reader", akana_tenant: A, session_id: SID },
      { sub: USER, role: "tenant_reader", akana_tenant: A, session_id: "a7300000-0000-0000-0000-000000005e02" },
      { sub: USER, role: "authenticated", akana_tenant: A, session_id: SID },
      { sub: USER, role: "tenant_reader", session_id: SID },
    ]) {
      const h = harness({ refresh: async () => jwt(payload) });
      expect(await completeTenantSignIn(h.deps)).toEqual({ ok: false, reason: "not_scoped" });
      expect(h.calls.at(-1)).toBe("signOut");
      expect(h.calls).not.toContain("commit");
    }
    const garbage = harness({ refresh: async () => "not-a-jwt" });
    expect(await completeTenantSignIn(garbage.deps)).toEqual({ ok: false, reason: "not_scoped" });
    expect(garbage.calls).not.toContain("commit");
  });

  it("scope not registered (flag off, lookup failed): sign out, no refresh, no cookie", async () => {
    const h = harness({ registerScope: async () => false });
    expect(await completeTenantSignIn(h.deps)).toEqual({ ok: false, reason: "register" });
    expect(h.calls).toEqual(["establish", "register", "signOut"]);
  });

  it("refresh fails, or Supabase does not accept the scoped token: sign out, no cookie", async () => {
    const a = harness({ refresh: async () => null });
    expect(await completeTenantSignIn(a.deps)).toEqual({ ok: false, reason: "refresh" });
    expect(a.calls).toEqual(["establish", "register", "refresh", "signOut"]);
    for (const answer of [null, "a7300000-0000-0000-0000-000000000002"]) {
      const b = harness({ verify: async () => answer });
      expect(await completeTenantSignIn(b.deps)).toEqual({ ok: false, reason: "verify" });
      expect(b.calls).toEqual(["establish", "register", "refresh", "verify", "signOut"]);
    }
  });

  it("a first token with no session id, or for another user, is never registered", async () => {
    for (const token of [jwt({ sub: USER, role: "authenticated" }), jwt({ sub: "someone-else", role: "authenticated", session_id: SID }), "junk"]) {
      const h = harness({ establish: async () => ({ accessToken: token, userId: USER, hasVerifiedFactor: false }) });
      expect(await completeTenantSignIn(h.deps)).toEqual({ ok: false, reason: "session" });
      expect(h.calls).toEqual(["establish", "signOut"]);
    }
  });

  it("an account with two-step sign-in is refused before anything is registered", async () => {
    const h = harness({ establish: async () => ({ accessToken: first, userId: USER, hasVerifiedFactor: true }) });
    expect(await completeTenantSignIn(h.deps)).toEqual({ ok: false, reason: "two_step" });
    expect(h.calls).toEqual(["establish", "signOut"]);
  });

  it("anything thrown, at any step, signs out and writes no cookie", async () => {
    const boom = async () => {
      throw new Error("down");
    };
    for (const step of ["registerScope", "refresh", "verify"] as const) {
      const h = harness({ [step]: boom } as Partial<TenantSignInDeps>);
      expect(await completeTenantSignIn(h.deps)).toEqual({ ok: false, reason: "error" });
      expect(h.calls.at(-1)).toBe("signOut");
      expect(h.calls).not.toContain("commit");
    }
    const early = harness({ establish: boom as unknown as TenantSignInDeps["establish"] });
    expect(await completeTenantSignIn(early.deps)).toEqual({ ok: false, reason: "error" });
    expect(early.calls).toEqual(["establish"]);
    // A sign-out that itself fails still ends in a refusal.
    const stuck = harness({ registerScope: async () => false, signOut: boom });
    expect(await completeTenantSignIn(stuck.deps)).toEqual({ ok: false, reason: "register" });
    expect(stuck.calls).not.toContain("commit");
  });

  it("maps every failure to a plain message code", () => {
    expect(tenantSignInErrorCode("two_step")).toBe("twostep");
    for (const r of ["establish", "session", "register", "refresh", "not_scoped", "verify", "store", "error"] as const) expect(tenantSignInErrorCode(r)).toBe("unavailable");
  });
});
