import { describe, expect, it } from "vitest";
import { type SendLogEntry, createMailer, createResendTransport, isOneClickUnsubscribeRequest, redact, unsubscribeHeaders } from "./mailer.js";

const KEY = "re_test_0123456789abcdef";
const reader = { name: "Sam", appUrl: "https://example.test/home", settingsUrl: "https://example.test/you", supportEmail: "support@example.test", themeName: "Worry and Fear" };
const links = { unsubscribe: "https://example.test/unsubscribe", oneClick: "https://example.test/api/unsubscribe" };

function make(env: Record<string, string | undefined>, extra: Partial<Parameters<typeof createMailer>[0]> = {}) {
  const log: SendLogEntry[] = [];
  const suppressed = new Set<string>(["bounced@example.test"]);
  const mailer = createMailer({
    env: { EMAIL_MODE: "live", EMAIL_FROM: "Akana <hello@example.test>", ...env },
    isSuppressed: (a) => suppressed.has(a.toLowerCase()),
    log: (e) => void log.push(e),
    ...extra,
  });
  return { mailer, log, suppressed };
}

describe("mailer guards", () => {
  it("refuses marketing and progress mail while the postal address is a placeholder, and allows transactional mail", async () => {
    for (const postal of ["PLACEHOLDER", "", undefined]) {
      const { mailer, log } = make({ POSTAL_ADDRESS: postal });
      const marketing = await mailer.sendReader("crosssell_general", reader, { to: "sam@example.test", links });
      expect(marketing.status).toBe("refused");
      expect(marketing.reason).toBe("postal_placeholder");
      const progress = await mailer.sendReader("inactive_7", reader, { to: "sam@example.test", links });
      expect(progress.status).toBe("refused");
      const signin = await mailer.sendReader("export_code", { ...reader, code: "123 456" }, { to: "sam@example.test" });
      const receipt = await mailer.sendReader("purchase_lifetime", { ...reader, offerName: "a single workbook", price: "£14" }, { to: "sam@example.test" });
      const security = await mailer.sendReader("password_changed", { ...reader, when: "now", device: "Mac" }, { to: "sam@example.test" });
      expect([signin.status, receipt.status, security.status]).toEqual(["sent", "sent", "sent"]);
      expect(mailer.devSends).toHaveLength(3);
      expect(log).toHaveLength(5);
    }
  });

  it("sends marketing once the postal address is real", async () => {
    const { mailer } = make({ POSTAL_ADDRESS: "Akana Ltd, 1 Example Street, Edinburgh" });
    const r = await mailer.sendReader("crosssell_general", reader, { to: "sam@example.test", links });
    expect(r.status).toBe("sent");
    expect(mailer.devSends[0]?.text).toContain("Akana Ltd, 1 Example Street, Edinburgh");
  });

  it("refuses consent mail with no unsubscribe link", async () => {
    const { mailer } = make({ POSTAL_ADDRESS: "Akana Ltd, 1 Example Street, Edinburgh" });
    const r = await mailer.sendReader("inactive_14", reader, { to: "sam@example.test" });
    expect(r.status).toBe("refused");
    expect(r.reason).toBe("no_unsubscribe");
  });

  it("sets POST-only one-click unsubscribe headers", async () => {
    const { mailer } = make({ POSTAL_ADDRESS: "Akana Ltd, 1 Example Street, Edinburgh" });
    await mailer.sendReader("inactive_14", reader, { to: "sam@example.test", links });
    const headers = mailer.devSends[0]?.headers;
    expect(headers?.["List-Unsubscribe"]).toBe(`<${links.oneClick}>`);
    expect(headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(unsubscribeHeaders(undefined)).toEqual({});
    expect(isOneClickUnsubscribeRequest("POST", "List-Unsubscribe=One-Click")).toBe(true);
    expect(isOneClickUnsubscribeRequest("GET", "List-Unsubscribe=One-Click")).toBe(false);
    expect(isOneClickUnsubscribeRequest("POST", "")).toBe(false);
  });

  it("suppresses bounced and complained addresses through the callback", async () => {
    const { mailer, log } = make({ POSTAL_ADDRESS: "Akana Ltd, 1 Example Street, Edinburgh" });
    const r = await mailer.sendReader("export_code", { ...reader, code: "123 456" }, { to: "bounced@example.test", userId: "u1" });
    expect(r.status).toBe("suppressed");
    expect(mailer.devSends).toHaveLength(0);
    expect(log[0]?.status).toBe("suppressed");
    expect(log[0]?.user_id).toBe("u1");
  });

  it("writes a send log entry of the agreed shape, with a hash and never the address", async () => {
    const { mailer, log } = make({});
    const r = await mailer.sendReader("export_code", { ...reader, code: "123 456" }, { to: "Sam@Example.test", userId: "u1", dedupeKey: "export:u1:1" });
    expect(r.status).toBe("sent");
    const e = log[0]!;
    expect(Object.keys(e).sort()).toEqual(
      ["at", "audience", "category", "dedupe_key", "id", "provider_id", "reason", "status", "template", "template_version", "to_hash", "user_id"].sort(),
    );
    expect(e.to_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(e)).not.toMatch(/example\.test/);
    expect(e.template).toBe("export_code");
    expect(e.category).toBe("transactional");
    expect(e.provider_id).toBe("dev_1");
  });

  it("sends a dedupe key at most once and frees it after a failure", async () => {
    let fail = true;
    const { mailer, log } = make({}, { transport: async () => (fail ? { ok: false, error: "boom" } : { ok: true, id: "p1" }) });
    const opts = { to: "sam@example.test", dedupeKey: "welcome:u1" };
    expect((await mailer.sendReader("welcome", reader, opts)).status).toBe("failed");
    fail = false;
    expect((await mailer.sendReader("welcome", reader, opts)).status).toBe("sent");
    expect((await mailer.sendReader("welcome", reader, opts)).status).toBe("skipped");
    expect(log.map((e) => e.status)).toEqual(["failed", "sent", "skipped"]);
  });

  it("routes to the test recipient unless EMAIL_MODE is live", async () => {
    const { mailer } = make({ EMAIL_MODE: "test", TEST_RECIPIENT: "crent@example.test" });
    const r = await mailer.sendReader("welcome", reader, { to: "sam@example.test" });
    expect(r.status).toBe("sent_test");
    expect(mailer.devSends[0]?.to).toBe("crent@example.test");
    expect(mailer.devSends[0]?.subject).toMatch(/^\[Test\] /);
    const { mailer: m2 } = make({ EMAIL_MODE: "test" });
    expect((await m2.sendReader("welcome", reader, { to: "sam@example.test" })).reason).toBe("no_test_recipient");
  });

  it("uses Resend when a key is set, and never lets the key reach a log or an error", async () => {
    const calls: { url: string; auth: string | undefined; body: string }[] = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      calls.push({ url: String(url), auth: headers.Authorization, body: String(init?.body) });
      return new Response(JSON.stringify({ message: `bad key ${KEY}` }), { status: 401 });
    }) as typeof fetch;
    const { mailer, log } = make({ RESEND_API_KEY: KEY }, { fetch: fetchImpl });
    const r = await mailer.sendReader("welcome", reader, { to: "sam@example.test" });
    expect(calls[0]?.url).toBe("https://api.resend.com/emails");
    expect(calls[0]?.auth).toBe(`Bearer ${KEY}`);
    expect(calls[0]?.body).not.toContain(KEY);
    expect(r.status).toBe("failed");
    expect(r.reason).not.toContain(KEY);
    expect(JSON.stringify(log)).not.toContain(KEY);
    expect(mailer.devSends).toHaveLength(0);
  });

  it("parses a successful Resend reply", async () => {
    const transport = createResendTransport(KEY, (async () => new Response(JSON.stringify({ id: "re_123" }), { status: 200 })) as typeof fetch);
    const r = await transport({ from: "a", to: "b", subject: "s", text: "t", html: "h", headers: {} });
    expect(r).toEqual({ ok: true, id: "re_123" });
    expect(redact(`token ${KEY} leaked`, [KEY])).toBe("token [redacted] leaked");
  });

  it("sends author mail that may name the workbook", async () => {
    const { mailer } = make({});
    const r = await mailer.sendAuthor(
      "live",
      { name: "Maya", workbookTitle: "Wired Differently", studioUrl: "https://example.test/studio", supportEmail: "support@example.test", liveUrl: "https://example.test/w/focus" },
      { to: "maya@example.test" },
    );
    expect(r.status).toBe("sent");
    expect(r.entry.audience).toBe("author");
    expect(mailer.devSends[0]?.text).toContain("Wired Differently");
  });
});
