import { describe, expect, it, vi } from "vitest";
import {
  checkDomainTxt,
  cnameTarget,
  DEFAULT_CNAME_TARGET,
  domainErrorNotice,
  domainState,
  parseDomainInput,
  parseTxtData,
  readTxtAnswer,
  runDomainChecks,
  txtRecordName,
  txtRecordValue,
  type DomainRpc,
} from "./tenant-domains";

const TOKEN = "0123456789abcdef0123456789abcdef";
const HOST = "books.example.com";

/** A fake DoH resolver: answers by record name, records every URL asked for. */
function fakeDns(answers: Record<string, unknown>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const name = new URL(url).searchParams.get("name") ?? "";
    const a = answers[name];
    if (a instanceof Error) throw a;
    if (typeof a === "number") return new Response("", { status: a });
    if (a === undefined) return new Response(JSON.stringify({ Status: 3 }), { status: 200 });
    return new Response(JSON.stringify(a), { status: 200 });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

const txt = (...data: string[]) => ({ Status: 0, Answer: data.map((d) => ({ name: "x", type: 16, TTL: 300, data: d })) });

describe("record values", () => {
  it("names the TXT record and value", () => {
    expect(txtRecordName(HOST)).toBe("_akana-verify.books.example.com");
    expect(txtRecordValue(TOKEN)).toBe(`akana-verify=${TOKEN}`);
  });

  it("uses the Vercel CNAME unless a valid target is configured", () => {
    expect(cnameTarget(undefined)).toBe(DEFAULT_CNAME_TARGET);
    expect(cnameTarget("")).toBe(DEFAULT_CNAME_TARGET);
    expect(cnameTarget("not a host!")).toBe(DEFAULT_CNAME_TARGET);
    expect(cnameTarget("ABC123.vercel-dns-017.com.")).toBe("abc123.vercel-dns-017.com");
  });
});

describe("parseDomainInput", () => {
  const apexes = ["akana.example.org", "akana-sites.example.net"];
  it("normalises a typed or pasted host", () => {
    expect(parseDomainInput("  Books.Example.COM. ", apexes)).toEqual({ ok: true, host: HOST });
    expect(parseDomainInput("https://books.example.com/w/x?y=1", apexes)).toEqual({ ok: true, host: HOST });
    expect(parseDomainInput("books.example.co.uk", apexes)).toEqual({ ok: true, host: "books.example.co.uk" });
  });

  it("refuses what is not a public host", () => {
    for (const bad of ["", "books", "books .example.com", "-x.example.com", "a..b.com", "books.example.com:8443", "[::1]", "x_y.example.com"]) {
      expect(parseDomainInput(bad, apexes)).toEqual({ ok: false, reason: "invalid" });
    }
    expect(parseDomainInput(null, apexes)).toEqual({ ok: false, reason: "invalid" });
  });

  it("refuses reserved hosts, Akana's own included", () => {
    for (const r of ["demo.localhost", "akana-x.vercel.app", "cname.vercel-dns.com", "10.0.0.1", "x.test", "akana.example.org", "www.akana.example.org", "penguin.akana-sites.example.net"]) {
      expect(parseDomainInput(r, apexes)).toEqual({ ok: false, reason: "reserved" });
    }
  });
});

describe("TXT answers", () => {
  it("joins split TXT strings and unescapes", () => {
    expect(parseTxtData('"akana-verify=0123" "456789abcdef0123456789abcdef"')).toBe(`akana-verify=${TOKEN}`);
    expect(parseTxtData('"a\\"b"')).toBe('a"b');
    expect(parseTxtData("plain")).toBe("plain");
  });

  it("reads the DoH JSON body", () => {
    const want = txtRecordValue(TOKEN);
    expect(readTxtAnswer(txt(`"${want}"`), want)).toBe("ok");
    expect(readTxtAnswer(txt('"v=spf1 -all"', `"${want}"`), want)).toBe("ok");
    expect(readTxtAnswer(txt('"akana-verify=ffffffffffffffffffffffffffffffff"'), want)).toBe("wrong_value");
    expect(readTxtAnswer({ Status: 0 }, want)).toBe("missing");
    expect(readTxtAnswer({ Status: 0, Answer: [{ type: 5, data: "cname.vercel-dns.com." }] }, want)).toBe("missing");
    expect(readTxtAnswer({ Status: 3 }, want)).toBe("missing");
    expect(readTxtAnswer({ Status: 2 }, want)).toBe("dns_error");
    expect(readTxtAnswer("nope", want)).toBe("dns_error");
    expect(readTxtAnswer(null, want)).toBe("dns_error");
  });
});

describe("checkDomainTxt with a fake resolver", () => {
  it("asks Cloudflare for the TXT record by name only, as dns-json", async () => {
    const dns = fakeDns({ [txtRecordName(HOST)]: txt(`"${txtRecordValue(TOKEN)}"`) });
    expect(await checkDomainTxt(HOST, TOKEN, { fetchImpl: dns.impl })).toBe("ok");
    expect(dns.calls).toHaveLength(1);
    const u = new URL(dns.calls[0]!.url);
    expect(u.origin + u.pathname).toBe("https://cloudflare-dns.com/dns-query");
    expect(u.searchParams.get("name")).toBe("_akana-verify.books.example.com");
    expect(u.searchParams.get("type")).toBe("TXT");
    expect(dns.calls[0]!.url).not.toContain(TOKEN);
    expect(new Headers(dns.calls[0]!.init?.headers).get("accept")).toBe("application/dns-json");
  });

  it("reports missing, wrong value and inconclusive answers", async () => {
    expect(await checkDomainTxt(HOST, TOKEN, { fetchImpl: fakeDns({}).impl })).toBe("missing");
    expect(await checkDomainTxt(HOST, TOKEN, { fetchImpl: fakeDns({ [txtRecordName(HOST)]: txt('"other"') }).impl })).toBe("wrong_value");
    expect(await checkDomainTxt(HOST, TOKEN, { fetchImpl: fakeDns({ [txtRecordName(HOST)]: 503 }).impl })).toBe("dns_error");
    expect(await checkDomainTxt(HOST, TOKEN, { fetchImpl: fakeDns({ [txtRecordName(HOST)]: new Error("offline") }).impl })).toBe("dns_error");
  });

  it("times out as inconclusive", async () => {
    const hang = vi.fn(
      (_: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_res, rej) => init?.signal?.addEventListener("abort", () => rej(new Error("aborted")))),
    ) as unknown as typeof fetch;
    expect(await checkDomainTxt(HOST, TOKEN, { fetchImpl: hang, timeoutMs: 10 })).toBe("dns_error");
  });

  it("never asks about a bad host or token", async () => {
    const dns = fakeDns({});
    expect(await checkDomainTxt("not a host", TOKEN, { fetchImpl: dns.impl })).toBe("dns_error");
    expect(await checkDomainTxt(HOST, "short", { fetchImpl: dns.impl })).toBe("dns_error");
    expect(dns.calls).toHaveLength(0);
  });
});

describe("domainState", () => {
  it("tells live, failing, pending and stopped apart", () => {
    expect(domainState({ verified_at: "2026-10-08T00:00:00Z", consecutive_failures: 0, stopped_at: null })).toBe("live");
    expect(domainState({ verified_at: "2026-10-08T00:00:00Z", consecutive_failures: 2, stopped_at: null })).toBe("live_failing");
    expect(domainState({ verified_at: null, consecutive_failures: 5, stopped_at: null })).toBe("pending");
    expect(domainState({ verified_at: null, consecutive_failures: 3, stopped_at: "2026-10-08T00:00:00Z" })).toBe("stopped");
  });

  it("maps database codes to notices", () => {
    expect(domainErrorNotice("AKD01")).toBe("domain_invalid");
    expect(domainErrorNotice("23505")).toBe("domain_taken");
    expect(domainErrorNotice("42501")).toBe("denied");
    expect(domainErrorNotice("XX000")).toBe("failed");
    expect(domainErrorNotice(undefined)).toBe("failed");
  });
});

describe("runDomainChecks", () => {
  function fakeAdmin(hosts: { host: string; verification_token: string }[], stopped: string[] = [], failRecord: string[] = []) {
    const recorded: { host: string; result: string }[] = [];
    const admin: DomainRpc = {
      rpc: async (fn, args) => {
        if (fn === "tenant_domains_to_check_job") return { data: hosts, error: null };
        if (fn === "record_tenant_domain_check_job") {
          const host = String(args?.p_host);
          if (failRecord.includes(host)) return { data: null, error: { code: "XX000" } };
          recorded.push({ host, result: String(args?.p_result) });
          return { data: { verified: !stopped.includes(host), stopped: stopped.includes(host) }, error: null };
        }
        return { data: null, error: { code: "42883" } };
      },
    };
    return { admin, recorded };
  }

  it("checks every host and records each result", async () => {
    const t2 = "fedcba9876543210fedcba9876543210";
    const { admin, recorded } = fakeAdmin(
      [
        { host: "a.example.com", verification_token: TOKEN },
        { host: "b.example.com", verification_token: t2 },
        { host: "c.example.com", verification_token: TOKEN },
        { host: "d.example.com", verification_token: TOKEN },
      ],
      ["b.example.com"],
    );
    const dns = fakeDns({
      "_akana-verify.a.example.com": txt(`"${txtRecordValue(TOKEN)}"`),
      "_akana-verify.b.example.com": txt('"stale"'),
      "_akana-verify.c.example.com": 500,
    });
    const s = await runDomainChecks(admin, { fetchImpl: dns.impl });
    expect(s).toEqual({ checked: 4, ok: 1, failed: 2, inconclusive: 1, stopped: ["b.example.com"], errors: 0, skipped: 0 });
    expect(recorded.sort((x, y) => x.host.localeCompare(y.host))).toEqual([
      { host: "a.example.com", result: "ok" },
      { host: "b.example.com", result: "wrong_value" },
      { host: "c.example.com", result: "dns_error" },
      { host: "d.example.com", result: "missing" },
    ]);
  });

  it("counts record errors and stops at the time budget", async () => {
    const hosts = ["a", "b", "c"].map((h) => ({ host: `${h}.example.com`, verification_token: TOKEN }));
    const { admin } = fakeAdmin(hosts, [], ["a.example.com"]);
    let t = 0;
    const s = await runDomainChecks(admin, { fetchImpl: fakeDns({}).impl, concurrency: 1, budgetMs: 15, now: () => (t += 10) });
    if ("error" in s) throw new Error("unexpected");
    expect(s.errors).toBe(1);
    expect(s.skipped).toBeGreaterThan(0);
  });

  it("returns the error when the host list fails", async () => {
    const admin: DomainRpc = { rpc: async () => ({ data: null, error: { code: "42501" } }) };
    expect(await runDomainChecks(admin)).toEqual({ error: "42501" });
  });
});
