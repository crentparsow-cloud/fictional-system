import { describe, expect, it, vi } from "vitest";
import { handleResendWebhook, parseResendEvent, signSvix, verifySvix } from "@/lib/resend-webhook";

const SECRET = `whsec_${Buffer.from("a-test-signing-key-of-some-length").toString("base64")}`;
const NOW = new Date("2026-11-25T12:00:00Z");
const TS = String(Math.floor(NOW.getTime() / 1000));
const body = (type: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ type, created_at: "2026-11-25T12:00:00Z", data: { email_id: "e_1", to: ["Reader@Example.test"], ...extra } });
const signed = (raw: string, id = "msg_1", ts = TS, secret = SECRET) => ({ id, timestamp: ts, signature: signSvix(raw, id, ts, secret) });

describe("the svix signature", () => {
  it("accepts a body signed with the secret", () => {
    const raw = body("email.bounced");
    expect(verifySvix(raw, signed(raw), SECRET, NOW)).toEqual({ ok: true });
  });

  it("accepts when one of several signatures matches", () => {
    const raw = body("email.bounced");
    const h = signed(raw);
    expect(verifySvix(raw, { ...h, signature: `v1,AAAA ${h.signature}` }, SECRET, NOW)).toEqual({ ok: true });
  });

  it("refuses a changed body, another secret, a missing header and an old delivery", () => {
    const raw = body("email.bounced");
    const h = signed(raw);
    expect(verifySvix(raw + " ", h, SECRET, NOW)).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifySvix(raw, signed(raw, "msg_1", TS, `whsec_${Buffer.from("another-key").toString("base64")}`), SECRET, NOW)).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifySvix(raw, { ...h, id: "msg_2" }, SECRET, NOW)).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifySvix(raw, { ...h, signature: null }, SECRET, NOW)).toEqual({ ok: false, reason: "missing_headers" });
    const old = String(Number(TS) - 301);
    expect(verifySvix(raw, signed(raw, "msg_1", old), SECRET, NOW)).toEqual({ ok: false, reason: "stale" });
    expect(verifySvix(raw, { ...h, timestamp: "soon" }, SECRET, NOW)).toEqual({ ok: false, reason: "stale" });
  });
});

describe("what an event means", () => {
  it("suppresses on a hard bounce and on a complaint", () => {
    expect(parseResendEvent(JSON.parse(body("email.bounced", { bounce: { type: "Permanent" } })))).toEqual({ type: "email.bounced", reason: "bounced", addresses: ["Reader@Example.test"] });
    expect(parseResendEvent(JSON.parse(body("email.complained")))).toEqual({ type: "email.complained", reason: "complained", addresses: ["Reader@Example.test"] });
  });

  it("suppresses nobody on a soft bounce or any other event", () => {
    expect(parseResendEvent(JSON.parse(body("email.bounced", { bounce: { type: "Transient" } })))).toEqual({ type: "email.bounced", reason: null, addresses: [] });
    expect(parseResendEvent(JSON.parse(body("email.delivered")))).toEqual({ type: "email.delivered", reason: null, addresses: [] });
  });

  it("refuses something that is not an event", () => {
    expect(parseResendEvent(null)).toBeNull();
    expect(parseResendEvent({ data: {} })).toBeNull();
  });
});

describe("the webhook", () => {
  it("answers 503 and records nothing while the secret is blank", async () => {
    const record = vi.fn();
    const raw = body("email.bounced");
    for (const secret of [undefined, "", "   "]) {
      expect((await handleResendWebhook(raw, signed(raw), { secret, record, now: () => NOW })).status).toBe(503);
    }
    expect(record).not.toHaveBeenCalled();
  });

  it("refuses an unsigned or wrongly signed delivery before recording anything", async () => {
    const record = vi.fn();
    const raw = body("email.bounced");
    expect((await handleResendWebhook(raw, { id: null, timestamp: null, signature: null }, { secret: SECRET, record, now: () => NOW })).status).toBe(400);
    expect((await handleResendWebhook(raw, { ...signed(raw), signature: "v1,bm9wZQ==" }, { secret: SECRET, record, now: () => NOW })).status).toBe(401);
    expect((await handleResendWebhook(raw + "x", signed(raw), { secret: SECRET, record, now: () => NOW })).status).toBe(401);
    expect(record).not.toHaveBeenCalled();
  });

  it("records a verified bounce once and reports a replay", async () => {
    const seen = new Set<string>();
    const record = vi.fn(async (id: string) => (seen.has(id) ? "replay" : (seen.add(id), "recorded")));
    const raw = body("email.bounced");
    const first = await handleResendWebhook(raw, signed(raw), { secret: SECRET, record, now: () => NOW });
    expect(first).toEqual({ status: 200, body: { received: true, replay: false } });
    expect(record).toHaveBeenCalledWith("msg_1", "email.bounced", "bounced", ["Reader@Example.test"]);
    const again = await handleResendWebhook(raw, signed(raw), { secret: SECRET, record, now: () => NOW });
    expect(again).toEqual({ status: 200, body: { received: true, replay: true } });
  });

  it("records a delivered event with no address", async () => {
    const record = vi.fn(async () => "recorded");
    const raw = body("email.delivered");
    await handleResendWebhook(raw, signed(raw), { secret: SECRET, record, now: () => NOW });
    expect(record).toHaveBeenCalledWith("msg_1", "email.delivered", null, []);
  });

  it("answers 500 when the database fails, so the provider retries, and never echoes an address", async () => {
    const raw = body("email.complained");
    const out = await handleResendWebhook(raw, signed(raw), { secret: SECRET, record: async () => Promise.reject(new Error("x")), now: () => NOW });
    expect(out.status).toBe(500);
    expect(JSON.stringify(out.body)).not.toContain("@");
  });

  it("refuses a signed body that is not JSON", async () => {
    const raw = "not json";
    expect((await handleResendWebhook(raw, signed(raw), { secret: SECRET, record: vi.fn(), now: () => NOW })).status).toBe(400);
  });
});
