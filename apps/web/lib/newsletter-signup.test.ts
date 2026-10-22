import { describe, expect, it, vi } from "vitest";
import { createRateLimiter } from "./rate-limit";
import { INITIAL_SIGNUP_STATE, NEWSLETTER_HONEYPOT, SIGNUP_DONE, processSignup, type SignupDeps } from "./newsletter-signup";

const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
};
const deps = (o: Partial<SignupDeps> = {}): SignupDeps & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    readiness: { ok: true },
    ipHash: "h".repeat(64),
    subscribe: async (email) => (calls.push(`subscribe:${email}`), { token: "t".repeat(64), code: null }),
    sendConfirmation: async (email) => (calls.push(`confirm:${email}`), true),
    ...o,
  };
};

describe("newsletter sign-up form (6.11)", () => {
  it("stores a pending address and sends the confirmation", async () => {
    const d = deps();
    const r = await processSignup(INITIAL_SIGNUP_STATE, form({ email: " Reader@Example.test " }), d);
    expect(r).toEqual({ status: "done", attempt: 1, message: SIGNUP_DONE });
    expect(d.calls).toEqual(["subscribe:reader@example.test", "confirm:reader@example.test"]);
  });

  it("collects no address while the sending guards are not met", async () => {
    const d = deps({ readiness: { ok: false, reason: "domain_blank" } });
    const r = await processSignup(INITIAL_SIGNUP_STATE, form({ email: "a@b.test" }), d);
    expect(r.status).toBe("error");
    expect(d.calls).toEqual([]);
  });

  it("says the same thing when no email goes out, so the list is not revealed", async () => {
    const d = deps({ subscribe: async () => ({ token: null, code: null }) });
    const r = await processSignup(INITIAL_SIGNUP_STATE, form({ email: "a@b.test" }), d);
    expect(r).toEqual({ status: "done", attempt: 1, message: SIGNUP_DONE });
    expect(d.calls).toEqual([]);
  });

  it("thanks a bot and stores nothing", async () => {
    const d = deps();
    const r = await processSignup(INITIAL_SIGNUP_STATE, form({ email: "a@b.test", [NEWSLETTER_HONEYPOT]: "https://spam.example" }), d);
    expect(r.status).toBe("done");
    expect(d.calls).toEqual([]);
  });

  it("refuses a bad address and keeps what was typed", async () => {
    const r = await processSignup(INITIAL_SIGNUP_STATE, form({ email: "nope" }), deps());
    expect(r).toMatchObject({ status: "error", email: "nope" });
  });

  it("limits sign-ups from one connection, in memory and in the database", async () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 3_600_000 });
    const d = deps({ limiter });
    await processSignup(INITIAL_SIGNUP_STATE, form({ email: "a@b.test" }), d);
    await processSignup(INITIAL_SIGNUP_STATE, form({ email: "c@b.test" }), d);
    const third = await processSignup(INITIAL_SIGNUP_STATE, form({ email: "d@b.test" }), d);
    expect(third.status).toBe("error");
    const db = await processSignup(INITIAL_SIGNUP_STATE, form({ email: "a@b.test" }), deps({ subscribe: async () => ({ token: null, code: "AKN29" }) }));
    expect(db.status).toBe("error");
  });

  it("still thanks the person when the confirmation email could not be sent, and logs it", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await processSignup(INITIAL_SIGNUP_STATE, form({ email: "a@b.test" }), deps({ sendConfirmation: async () => false }));
    expect(r.status).toBe("done");
    expect(spy).toHaveBeenCalledWith("newsletter_confirmation_not_sent");
    spy.mockRestore();
  });

  it("reports a database failure plainly", async () => {
    const r = await processSignup(INITIAL_SIGNUP_STATE, form({ email: "a@b.test" }), deps({ subscribe: async () => ({ token: null, code: "XX000" }) }));
    expect(r.status).toBe("error");
  });
});
