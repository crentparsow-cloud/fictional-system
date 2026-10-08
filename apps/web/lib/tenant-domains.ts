/**
 * Custom domains for white-label tenants (migration 0033).
 *
 * Staff add a host at /admin/white-label/[id]. The database gives it a
 * verification token. The tenant adds two DNS records:
 *
 *   TXT    _akana-verify.<host>   akana-verify=<token>
 *   CNAME  <host>                 <TENANT_CNAME_TARGET>  (cname.vercel-dns.com by default)
 *
 * checkDomainTxt() looks the TXT record up over DNS-over-HTTPS, using
 * Cloudflare's public resolver (https://cloudflare-dns.com/dns-query, JSON
 * API). It is the only third party involved. Only the record name is sent,
 * never the token. The result goes to public.record_tenant_domain_check
 * (staff, the Verify button) or public.record_tenant_domain_check_job (the
 * daily cron), which set or clear verified_at.
 *
 * Adding the host to the Vercel project is a manual step in the Vercel
 * dashboard. Nothing here calls Vercel. See docs/TENANT_RESOLUTION.md
 * section 9.
 *
 * Pure apart from the injected fetch, so the page, the action, the cron and
 * the tests share one answer.
 */
import { normaliseHost } from "@/lib/tenant";

export const TXT_LABEL = "_akana-verify";
export const TXT_VALUE_PREFIX = "akana-verify=";
export const DEFAULT_CNAME_TARGET = "cname.vercel-dns.com";
/** Vercel's documented A record for an apex domain, which cannot carry a CNAME. */
export const VERCEL_APEX_A = "76.76.21.21";
export const DOH_ENDPOINT = "https://cloudflare-dns.com/dns-query";
export const DOH_TIMEOUT_MS = 5_000;
export const MAX_DOMAINS_PER_TENANT = 5;
/** Failures in a row before a verified host stops resolving (0033). */
export const FAILURES_TO_STOP = 3;

export type CheckResult = "ok" | "missing" | "wrong_value" | "dns_error";

const TOKEN = /^[0-9a-f]{32}$/;
const HOST = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const RESERVED = /(^|\.)(localhost|vercel\.app|vercel-dns\.com)$|\.(local|internal|test|example|invalid|onion)$|\.[0-9]+$/;

export function txtRecordName(host: string): string {
  return `${TXT_LABEL}.${host}`;
}

export function txtRecordValue(token: string): string {
  return `${TXT_VALUE_PREFIX}${token}`;
}

export function cnameTarget(env: string | undefined = process.env.TENANT_CNAME_TARGET): string {
  const t = normaliseHost(env ?? "");
  return t && HOST.test(t) ? t : DEFAULT_CNAME_TARGET;
}

export type DomainInput = { ok: true; host: string } | { ok: false; reason: "invalid" | "reserved" };

/**
 * A host typed by staff, normalised as the proxy normalises it, then checked
 * against the same rules as app.tenant_host_problem (0033). The Akana apex,
 * TENANT_APEX and anything under either are refused too: those are served
 * from config, and a database row for them would be confusing at best.
 */
export function parseDomainInput(
  raw: FormDataEntryValue | string | null,
  reservedApexes: readonly string[] = [process.env.AKANA_HOST ?? "", process.env.TENANT_APEX ?? ""],
): DomainInput {
  if (typeof raw !== "string") return { ok: false, reason: "invalid" };
  let s = raw.trim().toLowerCase();
  // Forgive a pasted address: drop the scheme and anything after the host.
  s = s.replace(/^https?:\/\//, "").split(/[/?#]/)[0] ?? "";
  if (s.includes(":") || s.startsWith("[")) return { ok: false, reason: "invalid" };
  const host = normaliseHost(s);
  if (!host || !HOST.test(host)) return { ok: false, reason: "invalid" };
  if (RESERVED.test(host)) return { ok: false, reason: "reserved" };
  for (const a of reservedApexes) {
    const apex = normaliseHost(a);
    if (apex && (host === apex || host.endsWith(`.${apex}`))) return { ok: false, reason: "reserved" };
  }
  return { ok: true, host };
}

/**
 * A DoH JSON TXT answer's data field: one or more quoted strings, which
 * DNS joins with nothing between them. Unquoted data is taken as it is.
 */
export function parseTxtData(data: string): string {
  const parts = data.match(/"((?:[^"\\]|\\.)*)"/g);
  if (!parts) return data.trim();
  return parts.map((p) => p.slice(1, -1).replace(/\\(.)/g, "$1")).join("");
}

export interface CheckDeps {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Look up _akana-verify.<host> TXT and compare with the token.
 *
 *   ok           a TXT string equals akana-verify=<token>
 *   missing      NXDOMAIN, or the name has no TXT records
 *   wrong_value  TXT records exist but none matches
 *   dns_error    no usable answer (network, timeout, HTTP error, SERVFAIL,
 *                a malformed body). Recorded, never counted as a failure.
 *
 * Never throws.
 */
export async function checkDomainTxt(host: string, token: string, deps: CheckDeps = {}): Promise<CheckResult> {
  const h = normaliseHost(host);
  if (!h || !HOST.test(h) || !TOKEN.test(token)) return "dns_error";
  const doFetch = deps.fetchImpl ?? fetch;
  const url = `${DOH_ENDPOINT}?name=${encodeURIComponent(txtRecordName(h))}&type=TXT`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? DOH_TIMEOUT_MS);
  let body: unknown;
  try {
    const res = await doFetch(url, {
      method: "GET",
      headers: { accept: "application/dns-json" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return "dns_error";
    body = await res.json();
  } catch {
    return "dns_error";
  } finally {
    clearTimeout(timer);
  }
  return readTxtAnswer(body, txtRecordValue(token));
}

/** The decision on a parsed DoH JSON body. Exported for tests. */
export function readTxtAnswer(body: unknown, expected: string): CheckResult {
  if (!body || typeof body !== "object") return "dns_error";
  const b = body as { Status?: unknown; Answer?: unknown };
  if (b.Status === 3) return "missing";
  if (b.Status !== 0) return "dns_error";
  const answers = Array.isArray(b.Answer) ? b.Answer : [];
  const txt = answers
    .filter((a): a is { type: number; data: string } => !!a && typeof a === "object" && (a as { type?: unknown }).type === 16 && typeof (a as { data?: unknown }).data === "string")
    .map((a) => parseTxtData(a.data));
  if (txt.length === 0) return "missing";
  return txt.includes(expected) ? "ok" : "wrong_value";
}

export interface DomainRow {
  host: string;
  verification_token: string;
  verified_at: string | null;
  last_checked_at: string | null;
  last_check_result: CheckResult | null;
  consecutive_failures: number;
  stopped_at: string | null;
  created_at: string;
}

export type DomainState = "live" | "live_failing" | "pending" | "stopped";

/**
 * What staff see. A host that was verified and then failed three checks in a
 * row has verified_at cleared and stopped_at set by the database (0033).
 */
export function domainState(row: Pick<DomainRow, "verified_at" | "consecutive_failures" | "stopped_at">): DomainState {
  if (row.verified_at) return row.consecutive_failures > 0 ? "live_failing" : "live";
  return row.stopped_at ? "stopped" : "pending";
}

export const DOMAIN_STATE_LABEL: Record<DomainState, string> = {
  live: "Verified. The site is served on this host.",
  live_failing: "Verified, but the last check failed. The host stops after 3 failed checks in a row.",
  pending: "Waiting for the TXT record. Not served yet.",
  stopped: "Stopped. The TXT record failed 3 checks in a row, so the host is not served. Fix the record and verify again.",
};

export const CHECK_RESULT_LABEL: Record<CheckResult, string> = {
  ok: "TXT record found and matches.",
  missing: "No TXT record found at that name.",
  wrong_value: "A TXT record is there, but the value does not match.",
  dns_error: "The DNS lookup did not get an answer. This does not count as a failure.",
};

/** A fixed notice code for a database refusal; never the database's text. */
export function domainErrorNotice(code: string | undefined): string {
  switch (code) {
    case "AKD01":
      return "domain_invalid";
    case "AKD02":
      return "domain_reserved";
    case "AKD03":
      return "domain_tenant";
    case "AKD04":
      return "domain_limit";
    case "AKD05":
      return "domain_unknown";
    case "23505":
      return "domain_taken";
    case "42501":
      return "denied";
    case "23514":
      return "reason";
    default:
      return "failed";
  }
}

/** The slice of a Supabase client the daily run needs. */
export interface DomainRpc {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string } | null }>;
}

export interface RunSummary {
  checked: number;
  ok: number;
  failed: number;
  inconclusive: number;
  stopped: string[];
  errors: number;
  skipped: number;
}

/**
 * The daily cron's work: every white-label host, the longest unchecked
 * first, checked a few at a time and recorded through the service-role job
 * function. Stops starting new checks once the time budget is spent; the
 * rest go first tomorrow because they are the longest unchecked.
 */
export async function runDomainChecks(
  admin: DomainRpc,
  deps: CheckDeps & { budgetMs?: number; concurrency?: number; now?: () => number } = {},
): Promise<RunSummary | { error: string }> {
  const { data, error } = await admin.rpc("tenant_domains_to_check_job", { p_limit: 200 });
  if (error) return { error: error.code ?? "unknown" };
  const hosts = (Array.isArray(data) ? data : []).filter(
    (r): r is { host: string; verification_token: string } =>
      !!r && typeof (r as { host?: unknown }).host === "string" && typeof (r as { verification_token?: unknown }).verification_token === "string",
  );
  const now = deps.now ?? Date.now;
  const start = now();
  const budget = deps.budgetMs ?? 40_000;
  const summary: RunSummary = { checked: 0, ok: 0, failed: 0, inconclusive: 0, stopped: [], errors: 0, skipped: 0 };
  let next = 0;

  async function worker() {
    while (next < hosts.length) {
      if (now() - start > budget) {
        summary.skipped = hosts.length - next;
        next = hosts.length;
        return;
      }
      const row = hosts[next++]!;
      const result = await checkDomainTxt(row.host, row.verification_token, deps);
      const rec = await admin.rpc("record_tenant_domain_check_job", { p_host: row.host, p_result: result });
      if (rec.error) {
        summary.errors++;
        continue;
      }
      summary.checked++;
      if (result === "ok") summary.ok++;
      else if (result === "dns_error") summary.inconclusive++;
      else {
        summary.failed++;
        // True only on the check that cleared verified_at (0033).
        if ((rec.data as { stopped?: boolean } | null)?.stopped === true) summary.stopped.push(row.host);
      }
    }
  }

  const n = Math.max(1, Math.min(deps.concurrency ?? 4, hosts.length || 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return summary;
}
