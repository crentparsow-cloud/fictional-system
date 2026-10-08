#!/usr/bin/env node
/**
 * Test-mode load test for checkout and the Stripe webhook (F-145).
 *
 * It only sends requests that are safe on any deployment:
 *   - GET  /api/health
 *   - GET  public pages (home, Help now, help centre, pricing, sign-in)
 *   - POST /api/stripe/webhook with no signature        (expects 400)
 *   - POST /api/stripe/webhook with a forged signature  (expects 400)
 *   - POST /api/checkout while signed out              (expects 401)
 *
 * None of these reach Stripe, write to the database or send an email. A
 * forged signature is refused before any handler runs, and a signed-out
 * checkout is refused before the request body is read.
 *
 * It must never run against production. It refuses the production hosts
 * listed below and any host in LOAD_DENY_HOSTS. A host other than localhost
 * needs LOAD_CONFIRM_PREVIEW=1 as a second guard.
 *
 * Usage (Node 22, no dependencies):
 *   LOAD_BASE_URL=http://localhost:3100 node scripts/load/checkout-webhook.mjs
 *   LOAD_BASE_URL=https://akana-git-branch-crentparsow-clouds-projects.vercel.app \
 *     LOAD_CONFIRM_PREVIEW=1 VERCEL_AUTOMATION_BYPASS_SECRET=... \
 *     node scripts/load/checkout-webhook.mjs
 *
 * Settings (all optional):
 *   LOAD_CONCURRENCY  requests in flight at once per scenario (default 10)
 *   LOAD_REQUESTS     requests per scenario (default 200)
 *   LOAD_TIMEOUT_MS   per request timeout (default 15000)
 *   LOAD_P95_MS       p95 budget in ms; above it the scenario fails (default 2000)
 *   LOAD_ONLY         comma separated scenario names to run
 *
 * Exit code 0 when every scenario returns only its expected status and stays
 * inside the p95 budget, 1 otherwise. See docs/LAUNCH_CHECKLIST.md.
 */

const PRODUCTION_HOSTS = ["akana-one.vercel.app"];

const env = process.env;
const base = env.LOAD_BASE_URL;
if (!base) {
  console.error("Set LOAD_BASE_URL to a local server or a Vercel preview. Never production.");
  process.exit(2);
}

let url;
try {
  url = new URL(base);
} catch {
  console.error(`LOAD_BASE_URL is not a URL: ${base}`);
  process.exit(2);
}

const deny = new Set([...PRODUCTION_HOSTS, ...(env.LOAD_DENY_HOSTS ?? "").split(",").map((h) => h.trim()).filter(Boolean)]);
if (deny.has(url.hostname)) {
  console.error(`Refusing ${url.hostname}: it is a production host. Use a preview deployment.`);
  process.exit(2);
}
const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
if (!local && env.LOAD_CONFIRM_PREVIEW !== "1") {
  console.error(`${url.hostname} is not localhost. Set LOAD_CONFIRM_PREVIEW=1 to confirm it is a preview, not production.`);
  process.exit(2);
}

const CONCURRENCY = Number(env.LOAD_CONCURRENCY ?? 10);
const REQUESTS = Number(env.LOAD_REQUESTS ?? 200);
const TIMEOUT_MS = Number(env.LOAD_TIMEOUT_MS ?? 15000);
const P95_MS = Number(env.LOAD_P95_MS ?? 2000);

const commonHeaders = { "user-agent": "akana-load-test/1" };
if (env.VERCEL_AUTOMATION_BYPASS_SECRET) commonHeaders["x-vercel-protection-bypass"] = env.VERCEL_AUTOMATION_BYPASS_SECRET;

// A well-formed but forged Stripe signature: a current timestamp and a
// random v1 hash. constructEvent rejects it.
function forgedSignature() {
  const t = Math.floor(Date.now() / 1000);
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
  return `t=${t},v1=${hex}`;
}

const fakeEvent = JSON.stringify({ id: "evt_load_test", object: "event", type: "checkout.session.completed", data: { object: {} } });

const SCENARIOS = [
  { name: "health", method: "GET", path: "/api/health", expect: [200] },
  { name: "home", method: "GET", path: "/", expect: [200] },
  { name: "help-now", method: "GET", path: "/help-now", expect: [200] },
  { name: "help-centre", method: "GET", path: "/help", expect: [200] },
  { name: "pricing", method: "GET", path: "/pricing", expect: [200] },
  { name: "sign-in", method: "GET", path: "/sign-in", expect: [200] },
  {
    name: "webhook-no-signature",
    method: "POST",
    path: "/api/stripe/webhook",
    expect: [400],
    headers: () => ({ "content-type": "application/json" }),
    body: () => fakeEvent,
  },
  {
    name: "webhook-forged-signature",
    method: "POST",
    path: "/api/stripe/webhook",
    expect: [400],
    headers: () => ({ "content-type": "application/json", "stripe-signature": forgedSignature() }),
    body: () => fakeEvent,
  },
  {
    name: "checkout-signed-out",
    method: "POST",
    path: "/api/checkout",
    expect: [401],
    headers: () => ({ "content-type": "application/json", origin: url.origin }),
    body: () => JSON.stringify({ workbook: "load-test-not-a-workbook" }),
  },
];

const only = (env.LOAD_ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const chosen = only.length ? SCENARIOS.filter((s) => only.includes(s.name)) : SCENARIOS;

async function once(s) {
  const started = performance.now();
  try {
    const res = await fetch(new URL(s.path, url), {
      method: s.method,
      headers: { ...commonHeaders, ...(s.headers ? s.headers() : {}) },
      body: s.body ? s.body() : undefined,
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    await res.arrayBuffer();
    return { status: res.status, ms: performance.now() - started };
  } catch (err) {
    return { status: err?.name === "TimeoutError" ? "timeout" : "error", ms: performance.now() - started };
  }
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

async function run(s) {
  const results = [];
  let next = 0;
  const startedAt = performance.now();
  async function worker() {
    while (next < REQUESTS) {
      next++;
      results.push(await once(s));
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, CONCURRENCY) }, worker));
  const seconds = (performance.now() - startedAt) / 1000;
  const times = results.map((r) => r.ms).sort((a, b) => a - b);
  const statuses = {};
  for (const r of results) statuses[r.status] = (statuses[r.status] ?? 0) + 1;
  const unexpected = results.filter((r) => !s.expect.includes(r.status)).length;
  const p95 = percentile(times, 95);
  return {
    scenario: s.name,
    requests: results.length,
    rps: Number((results.length / seconds).toFixed(1)),
    p50: Math.round(percentile(times, 50)),
    p95: Math.round(p95),
    p99: Math.round(percentile(times, 99)),
    max: Math.round(times[times.length - 1] ?? 0),
    statuses: JSON.stringify(statuses),
    ok: unexpected === 0 && p95 <= P95_MS ? "yes" : "NO",
  };
}

console.log(`Load test against ${url.origin}: ${REQUESTS} requests per scenario, ${CONCURRENCY} at a time, p95 budget ${P95_MS} ms.`);
const rows = [];
for (const s of chosen) {
  const row = await run(s);
  rows.push(row);
  console.log(`${row.scenario}: ${row.rps} req/s, p95 ${row.p95} ms, statuses ${row.statuses}, ok ${row.ok}`);
}
console.table(rows);
const failed = rows.filter((r) => r.ok !== "yes");
if (failed.length) {
  console.error(`Failed: ${failed.map((r) => r.scenario).join(", ")}`);
  process.exit(1);
}
console.log("All scenarios passed.");
