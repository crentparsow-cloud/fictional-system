import { describe, expect, it, vi } from "vitest";
import { newTenantCode, normaliseEmail, TENANT_CODE_PATTERN, tenantCodeHash, tenantCodeKey } from "./tenant-code";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    throw new Error("not configured");
  },
}));

const A = "a7300000-0000-0000-0000-0000000000b1";
const B = "a7300000-0000-0000-0000-0000000000b2";
const KEYS = `v2.k1.${Buffer.alloc(32, 3).toString("base64")}`;
const ENV = { TENANT_SESSION_KEYS: KEYS };
const MAIL = { EMAIL_FROM: "Akana <hello@akana.example>", EMAIL_MODE: "live", POSTAL_ADDRESS: "1 Test Street, London" };

/**
 * The two database functions, in memory, with the rules of migration 0073
 * (which supabase/tests/0073 block 13 proves against the real thing): one
 * row per tenant and address, ten minutes, single use, five wrong tries.
 */
function fakeDb(now: () => number = () => Date.now()) {
  const rows = new Map<string, { hash: string; expires: number; attempts: number; consumed: boolean; issued: number }>();
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, args });
    const k = `${args.p_tenant}|${args.p_email}`;
    if (fn === "issue_tenant_sign_in_code") {
      // As the database does (0073): a sixth code within the hour is refused and nothing is written.
      const issued = rows.get(k)?.issued ?? 0;
      if (issued >= 5) return { data: false, error: null };
      rows.set(k, { hash: String(args.p_code_hash), expires: now() + Number(args.p_ttl_seconds) * 1000, attempts: 0, consumed: false, issued: issued + 1 });
      return { data: true, error: null };
    }
    const r = rows.get(k);
    if (!r || r.consumed || r.expires <= now() || r.attempts >= 5) return { data: false, error: null };
    if (r.hash === args.p_code_hash) {
      r.consumed = true;
      return { data: true, error: null };
    }
    r.attempts += 1;
    return { data: false, error: null };
  };
  return { rpc, rows, calls };
}

describe("tenant sign-in code, the pure part (F-133)", () => {
  it("makes eight digits, zeros kept, from the random source", () => {
    expect(newTenantCode(() => 7)).toBe("00000007");
    expect(newTenantCode(() => 99_999_999)).toBe("99999999");
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const c = newTenantCode();
      expect(c).toMatch(TENANT_CODE_PATTERN);
      seen.add(c);
    }
    expect(seen.size).toBeGreaterThan(190);
    let max = 0;
    newTenantCode((m) => ((max = m), 0));
    expect(max).toBe(100_000_000);
  });

  it("binds the hash to the tenant and the address", () => {
    const key = tenantCodeKey(ENV)!;
    const h = tenantCodeHash(key, A, "reader@example.com", "12345678");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("12345678");
    expect(tenantCodeHash(key, A.toUpperCase(), "READER@example.com", "12345678")).toBe(h);
    expect(tenantCodeHash(key, B, "reader@example.com", "12345678")).not.toBe(h);
    expect(tenantCodeHash(key, A, "other@example.com", "12345678")).not.toBe(h);
    expect(tenantCodeHash(key, A, "reader@example.com", "12345679")).not.toBe(h);
    // Another server key gives another hash: the table alone cannot be searched.
    expect(tenantCodeHash(tenantCodeKey({ TENANT_SESSION_KEYS: `v2.k2.${Buffer.alloc(32, 4).toString("base64")}` })!, A, "reader@example.com", "12345678")).not.toBe(h);
  });

  it("has no key, so no codes, when TENANT_SESSION_KEYS is blank or malformed", () => {
    for (const v of [undefined, "", "  ", "nonsense", "v1.k.abc"]) expect(tenantCodeKey({ TENANT_SESSION_KEYS: v })).toBeNull();
    // The key is derived, not the sealing key itself.
    expect(tenantCodeKey(ENV)!.equals(Buffer.alloc(32, 3))).toBe(false);
  });

  it("normalises an address or refuses it", () => {
    expect(normaliseEmail("  Reader@Example.COM ")).toBe("reader@example.com");
    for (const bad of [null, undefined, 5, "", "no-at", "a@b", "a b@c.d", `${"a".repeat(250)}@b.co`]) expect(normaliseEmail(bad)).toBeNull();
  });
});

describe("issuing and checking (F-133)", () => {
  async function setup(now?: () => number) {
    const { issueTenantCode, checkTenantCode } = await import("./tenant-code-server");
    const db = fakeDb(now);
    const sent: { to: string; subject: string; text: string }[] = [];
    const deps = {
      rpc: db.rpc,
      env: ENV,
      mailerEnv: MAIL,
      transport: async (m: { to: string; subject: string; text: string }) => {
        sent.push({ to: m.to, subject: m.subject, text: m.text });
        return { ok: true as const, id: "1" };
      },
    };
    const codeIn = (i = sent.length - 1) => /(\d{4}) (\d{4})/.exec(sent[i]!.text)!.slice(1).join("");
    return { issueTenantCode, checkTenantCode, db, sent, deps, codeIn };
  }

  it("emails a code that names the site, stores only its hash, and checks out once", async () => {
    const t = await setup();
    expect(await t.issueTenantCode({ tenantId: A, siteName: "Quillmoor Press", email: " Reader@Example.com " }, t.deps)).toBe("sent");
    expect(t.sent[0]!.to).toBe("reader@example.com");
    expect(t.sent[0]!.subject).toBe("Your sign-in code for Quillmoor Press, powered by Akana");
    expect(t.sent[0]!.text).not.toMatch(/https?:\/\//);
    const code = t.codeIn();
    const issued = t.db.calls[0]!;
    expect(issued.args).toMatchObject({ p_tenant: A, p_email: "reader@example.com", p_ttl_seconds: 600 });
    expect(JSON.stringify(issued.args)).not.toContain(code);
    expect(await t.checkTenantCode({ tenantId: A, email: "reader@example.com", code }, t.deps)).toBe(true);
    // Single use.
    expect(await t.checkTenantCode({ tenantId: A, email: "reader@example.com", code }, t.deps)).toBe(false);
  });

  it("a code for tenant A fails on tenant B, and for another address", async () => {
    const t = await setup();
    await t.issueTenantCode({ tenantId: A, siteName: "A Books", email: "reader@example.com" }, t.deps);
    const code = t.codeIn();
    expect(await t.checkTenantCode({ tenantId: B, email: "reader@example.com", code }, t.deps)).toBe(false);
    expect(await t.checkTenantCode({ tenantId: A, email: "other@example.com", code }, t.deps)).toBe(false);
    // Even if tenant B has a live code of its own for the same reader, A's code is not it.
    await t.issueTenantCode({ tenantId: B, siteName: "B Books", email: "reader@example.com" }, t.deps);
    expect(await t.checkTenantCode({ tenantId: B, email: "reader@example.com", code }, t.deps)).toBe(false);
    // And it still works where it belongs.
    expect(await t.checkTenantCode({ tenantId: A, email: "reader@example.com", code }, t.deps)).toBe(true);
  });

  it("works for ten minutes and then runs out", async () => {
    let clock = 1_000_000;
    const t = await setup(() => clock);
    await t.issueTenantCode({ tenantId: A, siteName: "A Books", email: "early@example.com" }, t.deps);
    await t.issueTenantCode({ tenantId: A, siteName: "A Books", email: "late@example.com" }, t.deps);
    clock += 10 * 60_000 - 1;
    expect(await t.checkTenantCode({ tenantId: A, email: "early@example.com", code: t.codeIn(0) }, t.deps)).toBe(true);
    clock += 1;
    expect(await t.checkTenantCode({ tenantId: A, email: "late@example.com", code: t.codeIn(1) }, t.deps)).toBe(false);
  });

  it("is dead after five wrong tries, even for the right code", async () => {
    const t = await setup();
    await t.issueTenantCode({ tenantId: A, siteName: "A Books", email: "reader@example.com" }, t.deps);
    const code = t.codeIn();
    const wrong = code === "00000000" ? "00000001" : "00000000";
    for (let i = 0; i < 5; i++) expect(await t.checkTenantCode({ tenantId: A, email: "reader@example.com", code: wrong }, t.deps)).toBe(false);
    expect(await t.checkTenantCode({ tenantId: A, email: "reader@example.com", code }, t.deps)).toBe(false);
  });

  it("gives the same answer for every address and never looks an account up", async () => {
    const t = await setup();
    const known = await t.issueTenantCode({ tenantId: A, siteName: "A Books", email: "has-account@example.com" }, t.deps);
    const unknown = await t.issueTenantCode({ tenantId: A, siteName: "A Books", email: "never-seen@example.com" }, t.deps);
    expect(known).toBe("sent");
    expect(unknown).toBe("sent");
    expect(t.sent.length).toBe(2);
    // The only database calls are the code functions.
    expect([...new Set(t.db.calls.map((c) => c.fn))]).toEqual(["issue_tenant_sign_in_code"]);
  });

  it("R2-5: a sixth code within the hour is refused by the database, and no email is sent for it", async () => {
    const t = await setup();
    for (let i = 0; i < 5; i++) expect(await t.issueTenantCode({ tenantId: A, siteName: "A Books", email: "victim@example.com" }, t.deps)).toBe("sent");
    expect(await t.issueTenantCode({ tenantId: A, siteName: "A Books", email: "victim@example.com" }, t.deps)).toBe("limited");
    expect(t.sent.length).toBe(5);
    // The limit is per tenant and address.
    expect(await t.issueTenantCode({ tenantId: B, siteName: "B Books", email: "victim@example.com" }, t.deps)).toBe("sent");
    expect(await t.issueTenantCode({ tenantId: A, siteName: "A Books", email: "other@example.com" }, t.deps)).toBe("sent");
    // The migration holds the limit in the same statement that writes the code.
    const sql = (await import("node:fs")).readFileSync(new URL("../../../supabase/migrations/0073_tenant_sign_in.sql", import.meta.url), "utf8");
    expect(sql).toContain("where c.window_started_at <= now() - interval '1 hour' or c.issued_in_window < 5;");
    expect(sql).toContain("return found;");
  });

  it("refuses malformed codes without asking the database", async () => {
    const t = await setup();
    for (const code of ["", "1234567", "123456789", "1234 5678", "abcdefgh", "12345678\n"]) expect(await t.checkTenantCode({ tenantId: A, email: "reader@example.com", code }, t.deps)).toBe(false);
    expect(t.db.calls).toEqual([]);
  });

  it("fails closed: no key, sign-in off for the tenant, a database error, an email that did not send", async () => {
    const t = await setup();
    expect(await t.issueTenantCode({ tenantId: A, siteName: "A", email: "reader@example.com" }, { ...t.deps, env: {} })).toBe("unavailable");
    expect(await t.checkTenantCode({ tenantId: A, email: "reader@example.com", code: "12345678" }, { ...t.deps, env: {} })).toBe(false);
    expect(t.db.calls).toEqual([]);
    const off = { ...t.deps, rpc: async () => ({ data: null, error: { code: "AKS02" } }) };
    expect(await t.issueTenantCode({ tenantId: A, siteName: "A", email: "reader@example.com" }, off)).toBe("unavailable");
    const down = { ...t.deps, rpc: async () => ({ data: null, error: { code: "57014" } }) };
    expect(await t.issueTenantCode({ tenantId: A, siteName: "A", email: "reader@example.com" }, down)).toBe("failed");
    expect(await t.checkTenantCode({ tenantId: A, email: "reader@example.com", code: "12345678" }, down)).toBe(false);
    expect(t.sent.length).toBe(0);
    const bounce = { ...t.deps, transport: async () => ({ ok: false as const, error: "provider down" }) };
    expect(await t.issueTenantCode({ tenantId: A, siteName: "A", email: "reader@example.com" }, bounce)).toBe("failed");
    // With no injected database and the service role not configured, nothing is tried.
    expect(await t.issueTenantCode({ tenantId: A, siteName: "A", email: "reader@example.com" }, { env: ENV, mailerEnv: MAIL })).toBe("unavailable");
    expect(await t.checkTenantCode({ tenantId: A, email: "reader@example.com", code: "12345678" }, { env: ENV })).toBe(false);
  });
});
