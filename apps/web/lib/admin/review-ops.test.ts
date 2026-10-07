import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createDevTransport } from "@akana/emails";
import { countFunnelEvent, countingOptedOut } from "@/lib/funnel";
import { opsCode, opsRecipient, opsSource, reportOps } from "@/lib/ops-alerts";
import { parseSupport, processSupport } from "@/lib/support";
import { INITIAL_SUPPORT_STATE } from "@/lib/support-form";
import { createRateLimiter } from "@/lib/rate-limit";
import { dayRange, parseRange, summarise, suppressed } from "./funnel";
import { daysAgoIso, opsKindLabel } from "./ops";
import {
  ageInDays,
  inReviewQueue,
  parseSignoff,
  reviewErrorNotice,
  reviewStatusLabel,
  reviewerMayApprove,
  runValidator,
  signoffKindsFor,
  traditionLine,
  unmetRequirements,
  versionUnderReview,
} from "./review";
import { SAVED_REPLIES, SUPPORT_TOPICS } from "./support";

const headers = (h: Record<string, string>) => new Headers(h);
const form = (values: Record<string, string>) => (k: string) => values[k] ?? null;

describe("review queue", () => {
  it("keeps draft, live, paused and retired out and lets any other status in", () => {
    for (const s of ["draft", "live", "paused", "retired"]) expect(inReviewQueue(s)).toBe(false);
    for (const s of ["in_review", "approved", "submitted", "editorial", "some_new_status"]) expect(inReviewQueue(s)).toBe(true);
  });

  it("labels statuses it has never seen", () => {
    expect(reviewStatusLabel("in_review")).toBe("In review");
    expect(reviewStatusLabel("author_check")).toBe("Author check");
  });

  it("picks the newest unpublished version, else the current one", () => {
    const vs = [
      { id: "a", workbook_id: "w", semver: "1.0.0", content_hash: "x", created_at: "2026-10-01T00:00:00Z", published_at: "2026-10-02T00:00:00Z", validated_at: null },
      { id: "b", workbook_id: "w", semver: "1.1.0", content_hash: "y", created_at: "2026-10-05T00:00:00Z", published_at: null, validated_at: null },
      { id: "c", workbook_id: "w", semver: "1.0.1", content_hash: "z", created_at: "2026-10-03T00:00:00Z", published_at: null, validated_at: null },
    ];
    expect(versionUnderReview({ id: "w", current_version_id: "a" }, vs)?.id).toBe("b");
    expect(versionUnderReview({ id: "w", current_version_id: "a" }, vs.slice(0, 1))?.id).toBe("a");
    expect(versionUnderReview({ id: "other", current_version_id: null }, vs)).toBeNull();
  });

  it("counts whole days of age", () => {
    expect(ageInDays("2026-10-01T12:00:00Z", new Date("2026-10-07T11:00:00Z"))).toBe(5);
    expect(ageInDays("not a date")).toBe(0);
  });

  it("runs the validator and fails a document that is not a workbook", () => {
    const r = runValidator({ title: "Not a workbook" });
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});

describe("release gate helpers", () => {
  it("lists unmet requirements in a fixed order, ignoring ones not required", () => {
    expect(
      unmetRequirements([
        { requirement: "licence", required: true, met: false },
        { requirement: "clinician", required: false, met: false },
        { requirement: "validator", required: true, met: false },
        { requirement: "editor", required: true, met: true },
      ]),
    ).toEqual(["validator", "licence"]);
  });

  it("gives safety sign-off to safety reviewers only", () => {
    expect(signoffKindsFor(["safety_reviewer"])).toEqual(["safety"]);
    expect(signoffKindsFor(["editor"])).not.toContain("safety");
    expect(signoffKindsFor(["support"])).toEqual([]);
  });

  it("needs a reviewer from the labelled tradition, unless the label is general", () => {
    expect(reviewerMayApprove("catholic", "catholic")).toBe(true);
    expect(reviewerMayApprove("protestant", "catholic")).toBe(false);
    expect(reviewerMayApprove("anglican", "general_christian")).toBe(true);
    expect(traditionLine("orthodox")).toBe("Written from within the Orthodox tradition. Readers from other churches are welcome.");
  });

  it("reads a sign-off form", () => {
    expect(parseSignoff(form({ kind: "editor", signer_name: " Ed " }))).toEqual({
      ok: true,
      value: { kind: "editor", signerName: "Ed", reviewerTradition: null, traditionLabel: null, note: null },
    });
    expect(parseSignoff(form({ kind: "boss", signer_name: "Ed" }))).toEqual({ ok: false, field: "kind" });
    expect(parseSignoff(form({ kind: "editor", signer_name: "" }))).toEqual({ ok: false, field: "signer_name" });
    expect(parseSignoff(form({ kind: "theological", signer_name: "Rev", reviewer_tradition: "protestant", tradition_label: "catholic" }))).toEqual({
      ok: false,
      field: "tradition_match",
    });
    const ok = parseSignoff(form({ kind: "theological", signer_name: "Rev", reviewer_tradition: "catholic", tradition_label: "catholic" }));
    expect(ok.ok && ok.value.traditionLabel).toBe("catholic");
  });

  it("maps database refusals to fixed notices", () => {
    expect(reviewErrorNotice("AKR01")).toBe("gate_refused");
    expect(reviewErrorNotice("AKR02")).toBe("gate_changed");
    expect(reviewErrorNotice("AKR03")).toBe("override_same_person");
    expect(reviewErrorNotice("42501")).toBe("denied");
    expect(reviewErrorNotice(undefined)).toBe("failed");
  });
});

describe("funnel", () => {
  it("honours the cookie, Global Privacy Control and Do Not Track", () => {
    expect(countingOptedOut(headers({}))).toBe(false);
    expect(countingOptedOut(headers({ "sec-gpc": "1" }))).toBe(true);
    expect(countingOptedOut(headers({ dnt: "1" }))).toBe(true);
    expect(countingOptedOut(headers({}), { get: () => ({ value: "1" }) })).toBe(true);
  });

  it("sends ids only, and nothing when opted out", async () => {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    const client = { rpc: async (fn: string, args: Record<string, unknown>) => (calls.push({ fn, args }), { error: null }) };
    expect(await countFunnelEvent(client, "page_view", { tenantId: "t", workbookId: "w", headers: headers({ "sec-gpc": "1" }) })).toBe(false);
    expect(calls).toHaveLength(0);
    expect(await countFunnelEvent(client, "purchase", { tenantId: "t", workbookId: "w", headers: null })).toBe(true);
    expect(calls[0]).toEqual({ fn: "record_funnel_event", args: { p_event: "purchase", p_tenant: "t", p_workbook: "w" } });
  });

  it("never throws when counting fails", async () => {
    const client = {
      rpc: async () => {
        throw new Error("down");
      },
    };
    expect(await countFunnelEvent(client, "page_view", { tenantId: "t", headers: null })).toBe(false);
  });

  it("summarises and suppresses small numbers per workbook", () => {
    const t = summarise([
      { event: "page_view", workbook_id: null, workbook_code: null, n: 10 },
      { event: "page_view", workbook_id: "w", workbook_code: "AK-AAAAA", n: 3 },
      { event: "purchase", workbook_id: "w", workbook_code: "AK-AAAAA", n: 7 },
      { event: "unknown", workbook_id: null, workbook_code: null, n: 99 },
    ]);
    expect(t.totals.page_view).toBe(13);
    expect(t.totals.purchase).toBe(7);
    expect(t.byWorkbook[0]?.counts.page_view).toBe(3);
    expect(suppressed(3)).toBe("Fewer than 5");
    expect(suppressed(1234)).toBe("1,234");
  });

  it("parses the range and works out UTC days", () => {
    expect(parseRange("90")).toBe("90");
    expect(parseRange("1000")).toBe("30");
    expect(dayRange(7, new Date("2026-10-07T23:30:00Z"))).toEqual({ from: "2026-10-01", to: "2026-10-07" });
  });
});

describe("ops alerts", () => {
  it("cleans sources and drops anything that is not a short code", () => {
    expect(opsSource("/api/stripe/webhook")).toBe("api/stripe/webhook");
    expect(opsCode("handler_failed")).toBe("handler_failed");
    expect(opsCode("failed for jo@example.com")).toBeNull();
    expect(opsKindLabel("cron_failure")).toBe("Scheduled job failure");
    expect(daysAgoIso(1, new Date("2026-10-07T00:00:00Z"))).toBe("2026-10-06T00:00:00.000Z");
  });

  it("prefers OPS_ALERT_TO, then LEADS_NOTIFY_TO", () => {
    expect(opsRecipient({ OPS_ALERT_TO: "ops@x.test", LEADS_NOTIFY_TO: "leads@x.test" })).toBe("ops@x.test");
    expect(opsRecipient({ LEADS_NOTIFY_TO: "leads@x.test" })).toBe("leads@x.test");
    expect(opsRecipient({})).toBeNull();
  });

  it("emails once when an alert opens and stamps it", async () => {
    const calls: string[] = [];
    let notify = true;
    const admin = {
      rpc: async (fn: string) => {
        calls.push(fn);
        if (fn === "record_ops_event") return { data: [{ alert_id: "a1", notify }], error: null };
        return { data: null, error: null };
      },
    };
    const dev = createDevTransport();
    const env = { EMAIL_MODE: "live", EMAIL_FROM: "Akana <ops@x.test>", OPS_ALERT_TO: "crent@x.test" };
    const first = await reportOps(admin, "webhook_failure", "/api/stripe/webhook", "handler_failed", { env, transport: dev.transport });
    expect(first).toEqual({ alertId: "a1", notified: true });
    expect(calls).toEqual(["record_ops_event", "mark_ops_alert_notified"]);
    expect(dev.sends[0]?.subject).toBe("Akana alert: something needs a look");
    expect(dev.sends[0]?.to).toBe("crent@x.test");
    expect(dev.sends[0]?.text).toContain("api/stripe/webhook");

    notify = false;
    const second = await reportOps(admin, "webhook_failure", "api/stripe/webhook", null, { env, transport: dev.transport });
    expect(second.notified).toBe(false);
    expect(dev.sends).toHaveLength(1);
  });

  it("never throws when the database is unreachable", async () => {
    const admin = {
      rpc: async () => {
        throw new Error("down");
      },
    };
    expect(await reportOps(admin, "error", "api/x", "y")).toEqual({ alertId: null, notified: false });
  });
});

describe("support inbox", () => {
  const fd = (v: Record<string, string>) => {
    const f = new FormData();
    for (const [k, val] of Object.entries(v)) f.set(k, val);
    return f;
  };
  const good = { topic: "refund", name: "Jo", email: "jo@x.test", message: "Please refund", consent: "yes" };

  it("has a saved reply for every topic", () => {
    for (const t of SUPPORT_TOPICS) expect(SAVED_REPLIES[t].body.length).toBeGreaterThan(20);
    expect(SAVED_REPLIES.worried.body).toMatch(/not a crisis service/);
  });

  it("checks every field and needs consent", () => {
    expect(parseSupport({ ...good, consent: true }).ok).toBe(true);
    const bad = parseSupport({ topic: "chat", name: "", email: "nope", message: "", consent: false });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.fieldErrors).sort()).toEqual(["consent", "email", "message", "name", "topic"]);
  });

  it("stores a good message with a hashed address, and marks a worried one", async () => {
    let args: Record<string, unknown> = {};
    const r = await processSupport(INITIAL_SUPPORT_STATE, fd({ ...good, topic: "worried" }), {
      ip: "203.0.113.9",
      salt: "s",
      submit: async (a) => ((args = a), { id: "m1", error: null }),
    });
    expect(r).toEqual({ status: "success", attempt: 1, worried: true });
    expect(String(args.p_ip_hash)).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(args)).not.toContain("203.0.113.9");
  });

  it("gives bots a success and stores nothing", async () => {
    let called = false;
    const r = await processSupport(INITIAL_SUPPORT_STATE, fd({ ...good, website: "spam" }), {
      ip: "1",
      salt: "s",
      submit: async () => ((called = true), { id: "x", error: null }),
    });
    expect(r.status).toBe("success");
    expect(called).toBe(false);
  });

  it("says when the rate limit is hit", async () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    const deps = { ip: "1", salt: "s", limiter, submit: async () => ({ id: "x", error: null }) };
    await processSupport(INITIAL_SUPPORT_STATE, fd(good), deps);
    const r = await processSupport(INITIAL_SUPPORT_STATE, fd(good), deps);
    expect(r.status === "error" && r.message).toMatch(/several messages/);
    const db = await processSupport(INITIAL_SUPPORT_STATE, fd(good), { ip: "2", salt: "s", submit: async () => ({ id: null, error: { code: "AKH29" } }) });
    expect(db.status === "error" && db.message).toMatch(/several messages/);
  });
});
