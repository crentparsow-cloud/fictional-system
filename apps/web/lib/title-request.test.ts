import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createRateLimiter } from "./rate-limit";
import { INITIAL_TITLE_REQUEST_STATE, parseTitleRequest, processTitleRequest, titleRequestValues, type SubmitTitleRequest } from "./title-request";

function form(over: Record<string, string> = {}): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ title: "The Power of Habit", author: "Charles Duhigg", note: "Please.", ...over })) fd.set(k, v);
  return fd;
}

const ok: SubmitTitleRequest = async () => ({ id: "11111111-1111-1111-1111-111111111111", error: null });

describe("parseTitleRequest", () => {
  it("accepts a title alone and turns blanks into null", () => {
    const r = parseTitleRequest({ title: "  Atomic Habits  ", author: "  ", note: "" });
    expect(r).toEqual({ ok: true, value: { title: "Atomic Habits", author: null, note: null } });
  });

  it("asks for a title", () => {
    expect(parseTitleRequest({ title: "   " })).toMatchObject({ ok: false, fieldErrors: { title: "Tell us the title" } });
    expect(parseTitleRequest({})).toMatchObject({ ok: false });
  });

  it("refuses a title with no letters or digits", () => {
    expect(parseTitleRequest({ title: "!!! ???" })).toMatchObject({ ok: false, fieldErrors: { title: "Tell us the title" } });
  });

  it("holds the lengths", () => {
    expect(parseTitleRequest({ title: "x".repeat(201) })).toMatchObject({ ok: false, fieldErrors: { title: expect.stringContaining("200") } });
    expect(parseTitleRequest({ title: "x", author: "y".repeat(201) })).toMatchObject({ ok: false, fieldErrors: { author: expect.any(String) } });
    expect(parseTitleRequest({ title: "x", note: "n".repeat(1001) })).toMatchObject({ ok: false, fieldErrors: { note: expect.any(String) } });
    expect(parseTitleRequest({ title: "x".repeat(200), note: "n".repeat(1000) }).ok).toBe(true);
  });
});

describe("titleRequestValues", () => {
  it("reads strings only", () => {
    expect(titleRequestValues(form({ title: "A" }))).toEqual({ title: "A", author: "Charles Duhigg", note: "Please." });
    const fd = new FormData();
    fd.set("title", new Blob(["x"]), "x.txt");
    expect(titleRequestValues(fd).title).toBeUndefined();
  });
});

describe("processTitleRequest", () => {
  const deps = (submit: SubmitTitleRequest, limiter = createRateLimiter({ limit: 5, windowMs: 1000 })) => ({ submit, ip: "203.0.113.9", salt: "salt", limiter });

  it("stores a request with a hashed address, never the address", async () => {
    const submit = vi.fn(ok);
    const s = await processTitleRequest(INITIAL_TITLE_REQUEST_STATE, form(), deps(submit));
    expect(s).toEqual({ status: "success", attempt: 1 });
    const args = submit.mock.calls[0]?.[0];
    expect(args).toMatchObject({ p_title: "The Power of Habit", p_author: "Charles Duhigg", p_note: "Please." });
    expect(args?.p_ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(args)).not.toContain("203.0.113.9");
  });

  it("says success to a bot and stores nothing", async () => {
    const submit = vi.fn(ok);
    const s = await processTitleRequest(INITIAL_TITLE_REQUEST_STATE, form({ website: "http://spam.example" }), deps(submit));
    expect(s.status).toBe("success");
    expect(submit).not.toHaveBeenCalled();
  });

  it("returns field errors and keeps what was typed", async () => {
    const submit = vi.fn(ok);
    const s = await processTitleRequest(INITIAL_TITLE_REQUEST_STATE, form({ title: "" }), deps(submit));
    expect(s).toMatchObject({ status: "error", fieldErrors: { title: "Tell us the title" }, values: { author: "Charles Duhigg" } });
    expect(submit).not.toHaveBeenCalled();
  });

  it("limits one address, then stops calling the database", async () => {
    const submit = vi.fn(ok);
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000 });
    const d = deps(submit, limiter);
    expect((await processTitleRequest(INITIAL_TITLE_REQUEST_STATE, form(), d)).status).toBe("success");
    expect((await processTitleRequest(INITIAL_TITLE_REQUEST_STATE, form(), d)).status).toBe("success");
    const third = await processTitleRequest(INITIAL_TITLE_REQUEST_STATE, form(), d);
    expect(third).toMatchObject({ status: "error", message: expect.stringContaining("tomorrow") });
    expect(submit).toHaveBeenCalledTimes(2);
  });

  it("maps the database's rate limit and failures to plain messages", async () => {
    const limited = await processTitleRequest(INITIAL_TITLE_REQUEST_STATE, form(), deps(async () => ({ id: null, error: { code: "AKZ29" } })));
    expect(limited).toMatchObject({ status: "error", message: expect.stringContaining("tomorrow") });
    const bad = await processTitleRequest(INITIAL_TITLE_REQUEST_STATE, form(), deps(async () => ({ id: null, error: { code: "AKZ01" } })));
    expect(bad).toMatchObject({ status: "error", message: expect.stringContaining("Check the form") });
    const down = await processTitleRequest(INITIAL_TITLE_REQUEST_STATE, form(), deps(async () => ({ id: null, error: { code: "XX000" } })));
    expect(down).toMatchObject({ status: "error", message: expect.stringContaining("not sent") });
  });
});
