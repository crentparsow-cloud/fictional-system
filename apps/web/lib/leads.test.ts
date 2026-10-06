import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { type OutboundMessage, type SendLogEntry, type Transport } from "@akana/emails";
import { HONEYPOT_FIELD, INITIAL_ENQUIRY_STATE, SUCCESS_MESSAGE } from "@/app/publish/options";
import { type EnquiryDeps, type Lead, type SubmitLeadArgs, clientIp, hashWithSalt, leadSalt, notifyLead, parseLead, processEnquiry } from "@/lib/leads";
import { createRateLimiter } from "@/lib/rate-limit";

const good = {
  name: "Ann Author",
  email: " Ann@Example.TEST ",
  kind: "author",
  organisation: "",
  book_title: "The Quiet Method",
  book_ref: "978-0-00-000000-0",
  genre: "wellbeing",
  interest: "marketplace",
  message: "Please call me about The Quiet Method.",
  consent: true,
};

function form(over: Record<string, string | null> = {}): FormData {
  const fd = new FormData();
  const base: Record<string, string | null> = { ...good, consent: "on", ...over } as Record<string, string | null>;
  for (const [k, v] of Object.entries(base)) if (v !== null) fd.set(k, v);
  return fd;
}

function deps(over: Partial<EnquiryDeps> = {}) {
  const calls: SubmitLeadArgs[] = [];
  const notified: (Lead & { id: string })[] = [];
  const d: EnquiryDeps = {
    ip: "203.0.113.9",
    userAgent: "Mozilla/5.0 test",
    salt: "test-salt",
    submit: async (args) => {
      calls.push(args);
      return { id: "00000000-0000-0000-0000-0000000000aa", error: null };
    },
    notify: async (lead) => void notified.push(lead),
    ...over,
  };
  return { d, calls, notified };
}

describe("lead schema", () => {
  it("accepts a full enquiry, trims, lower-cases the email and drops empty optionals", () => {
    const r = parseLead(good);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lead.email).toBe("ann@example.test");
    expect(r.lead.organisation).toBeUndefined();
    expect(r.lead.kind).toBe("author");
  });

  it("gives one message per field for missing required answers", () => {
    const r = parseLead({ consent: false });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.fieldErrors).sort()).toEqual(["book_title", "consent", "email", "genre", "interest", "kind", "name"]);
    expect(r.fieldErrors.name).toBe("Enter your name");
    expect(r.fieldErrors.consent).toMatch(/Tick the box/);
  });

  it("refuses a bad email, an unknown genre, an unknown kind and an over-long message", () => {
    const r = parseLead({ ...good, email: "not-an-email", genre: "romance", kind: "robot", message: "x".repeat(4001) });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fieldErrors.email).toMatch(/right format/);
    expect(r.fieldErrors.genre).toBe("Choose a genre");
    expect(r.fieldErrors.kind).toBe("Choose what describes you");
    expect(r.fieldErrors.message).toMatch(/4,000/);
  });

  it("requires consent to be given", () => {
    expect(parseLead({ ...good, consent: false }).ok).toBe(false);
  });
});

describe("processEnquiry", () => {
  it("drops a bot silently: success, no database call, no email", async () => {
    const { d, calls, notified } = deps();
    const r = await processEnquiry(INITIAL_ENQUIRY_STATE, form({ [HONEYPOT_FIELD]: "https://spam.example" }), d);
    expect(r).toEqual({ status: "success", attempt: 1, message: SUCCESS_MESSAGE });
    expect(calls).toHaveLength(0);
    expect(notified).toHaveLength(0);
  });

  it("stores a real enquiry with hashed IP and user agent, then notifies", async () => {
    const { d, calls, notified } = deps();
    const r = await processEnquiry(INITIAL_ENQUIRY_STATE, form({ [HONEYPOT_FIELD]: "" }), d);
    expect(r.status).toBe("success");
    expect(calls).toHaveLength(1);
    const a = calls[0]!;
    expect(a.p_ip_hash).toBe(hashWithSalt("203.0.113.9", "test-salt"));
    expect(a.p_ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(a)).not.toContain("203.0.113.9");
    expect(JSON.stringify(a)).not.toContain("Mozilla");
    expect(a.p_consent).toBe(true);
    expect(a.p_source).toBe("publish_page");
    expect(notified[0]?.id).toBe("00000000-0000-0000-0000-0000000000aa");
  });

  it("returns field errors and the values back without calling the database", async () => {
    const { d, calls } = deps();
    const r = await processEnquiry(INITIAL_ENQUIRY_STATE, form({ name: "", consent: null }), d);
    expect(r.status).toBe("error");
    if (r.status !== "error") return;
    expect(r.fieldErrors.name).toBeDefined();
    expect(r.fieldErrors.consent).toBeDefined();
    expect(r.values.book_title).toBe("The Quiet Method");
    expect(calls).toHaveLength(0);
  });

  it("maps the database rate limit to a plain message", async () => {
    const { d, notified } = deps({ submit: async () => ({ id: null, error: { code: "AKL29", message: "rate_limited" } }) });
    const r = await processEnquiry(INITIAL_ENQUIRY_STATE, form(), d);
    expect(r.status).toBe("error");
    if (r.status !== "error") return;
    expect(r.message).toMatch(/try again later/);
    expect(notified).toHaveLength(0);
  });

  it("stops the sixth attempt in an hour before the database when a limiter is given", async () => {
    const limiter = createRateLimiter({ limit: 5, windowMs: 3_600_000 });
    const { d, calls } = deps({ limiter });
    for (let i = 0; i < 5; i++) expect((await processEnquiry(INITIAL_ENQUIRY_STATE, form(), d)).status).toBe("success");
    expect((await processEnquiry(INITIAL_ENQUIRY_STATE, form(), d)).status).toBe("error");
    expect(calls).toHaveLength(5);
  });

  it("still succeeds when the email fails, because the lead is stored", async () => {
    const { d } = deps({ notify: async () => Promise.reject(new Error("smtp down")) });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await processEnquiry(INITIAL_ENQUIRY_STATE, form(), d);
    spy.mockRestore();
    expect(r.status).toBe("success");
  });
});

describe("notifyLead", () => {
  const lead = { ...(parseLead(good) as { ok: true; lead: Lead }).lead, id: "00000000-0000-0000-0000-0000000000aa" };

  function fake() {
    const sent: OutboundMessage[] = [];
    const transport: Transport = async (m) => {
      sent.push(m);
      return { ok: true, id: "fake_1" };
    };
    return { sent, transport };
  }

  it("sends lead_received with no title and no message in the subject", async () => {
    const { sent, transport } = fake();
    const log: SendLogEntry[] = [];
    const r = await notifyLead(lead, {
      env: { LEADS_NOTIFY_TO: "team@example.test", RESEND_API_KEY: "re_test_key_never_used", EMAIL_MODE: "live", EMAIL_FROM: "Akana <hello@example.test>" },
      origin: "https://akana.example",
      transport,
      log: (e) => void log.push(e),
    });
    expect(r.status).toBe("sent");
    expect(sent).toHaveLength(1);
    const m = sent[0]!;
    expect(m.to).toBe("team@example.test");
    expect(m.subject).toBe("New publishing enquiry");
    expect(m.subject).not.toContain("Quiet Method");
    expect(m.subject).not.toContain("Please call");
    expect(m.subject).not.toContain("Ann");
    expect(m.text).toContain("ann@example.test");
    expect(m.text).toContain("https://akana.example/admin/leads");
    expect(log[0]?.template).toBe("lead_received");
    expect(JSON.stringify(log[0])).not.toContain("team@example.test");
  });

  it("uses the dev transport when LEADS_NOTIFY_TO or RESEND_API_KEY is unset", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const log: SendLogEntry[] = [];
    for (const env of [{ RESEND_API_KEY: "re_test_key_never_used" }, { LEADS_NOTIFY_TO: "team@example.test" }, {}]) {
      const r = await notifyLead(lead, { env, origin: "http://localhost:3000", log: (e) => void log.push(e) });
      expect(r.status).toBe("sent");
      expect(r.providerId).toMatch(/^dev_/);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("hashing and request details", () => {
  it("falls back to the dev salt only outside production", () => {
    expect(leadSalt({ LEAD_HASH_SALT: "s3cret" })).toBe("s3cret");
    expect(leadSalt({ NODE_ENV: "development" })).toMatch(/dev/);
    expect(() => leadSalt({ NODE_ENV: "production" })).toThrow(/LEAD_HASH_SALT/);
  });

  it("reads the first forwarded address", () => {
    const h = new Headers({ "x-forwarded-for": "198.51.100.7, 10.0.0.1" });
    expect(clientIp(h)).toBe("198.51.100.7");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
