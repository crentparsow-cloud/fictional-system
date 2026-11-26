import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { FORMS_NOT_CONFIGURED, submitLeadAsServer, submitNoticeAsServer, submitSupportAsServer } from "@/lib/public-forms";

const HASH = "a".repeat(64);
const U = "74740000-0000-0000-0000-000000000004";

function client(result: { data: unknown; error: { code?: string; message?: string } | null }) {
  const rpc = vi.fn<(fn: string, args: Record<string, unknown>) => Promise<typeof result>>(async () => result);
  return { rpc, get: () => ({ rpc }) };
}

const leadArgs = {
  p_kind: "author", p_name: "Ann", p_email: "ann@example.test", p_consent: true, p_ip_hash: HASH, p_user_agent_hash: null,
  p_organisation: null, p_book_title: null, p_book_ref: null, p_genre: null, p_interest: null, p_message: null, p_source: "publish",
};
const supportArgs = { p_topic: "access", p_name: "Jo", p_email: "jo@example.test", p_message: "Hello", p_consent: true, p_ip_hash: HASH };
const noticeArgs = {
  p_kind: "notice" as const, p_basis: "copyright", p_name: "R", p_email: "r@example.test", p_address: "1 High St", p_phone: null,
  p_relationship: "owner", p_acting_for: null, p_work: null, p_location: "AK-T74X1", p_explanation: "Copied.", p_good_faith: true,
  p_accurate: true, p_jurisdiction: null, p_signature: "R", p_parent_reference: null, p_ip_hash: HASH,
};

describe("public form database calls (review finding M4)", () => {
  it("the enquiry calls submit_lead with the server's hash", async () => {
    const c = client({ data: "lead-id", error: null });
    expect(await submitLeadAsServer(c.get)(leadArgs)).toEqual({ id: "lead-id", error: null });
    expect(c.rpc).toHaveBeenCalledWith("submit_lead", leadArgs);
  });

  it("the contact form passes the verified sender, or null when signed out", async () => {
    const c = client({ data: "msg-id", error: null });
    expect(await submitSupportAsServer(c.get, U)(supportArgs)).toEqual({ id: "msg-id", error: null });
    expect(c.rpc).toHaveBeenCalledWith("submit_support_message_as", { p_user: U, ...supportArgs });
    await submitSupportAsServer(c.get, null)(supportArgs);
    expect(c.rpc).toHaveBeenLastCalledWith("submit_support_message_as", { p_user: null, ...supportArgs });
  });

  it("the notice form calls submit_takedown_notice and returns the reference", async () => {
    const c = client({ data: "TD-ABC123", error: null });
    expect(await submitNoticeAsServer(c.get)(noticeArgs)).toEqual({ reference: "TD-ABC123", error: null });
    expect(c.rpc).toHaveBeenCalledWith("submit_takedown_notice", noticeArgs);
  });

  it("passes the database's error code through, so the rate limit message still shows", async () => {
    expect(await submitLeadAsServer(client({ data: null, error: { code: "AKL29", message: "rate_limited" } }).get)(leadArgs)).toEqual({
      id: null,
      error: { code: "AKL29", message: "rate_limited" },
    });
    expect(await submitSupportAsServer(client({ data: null, error: { code: "AKH29" } }).get, null)(supportArgs)).toEqual({ id: null, error: { code: "AKH29" } });
    expect(await submitNoticeAsServer(client({ data: null, error: { code: "AKN29" } }).get)(noticeArgs)).toEqual({ reference: null, error: { code: "AKN29" } });
  });

  it("a missing service role key is an error result, not a thrown error", async () => {
    const missing = () => {
      throw new Error("Service role client is not configured");
    };
    expect(await submitLeadAsServer(missing)(leadArgs)).toEqual({ id: null, error: { code: FORMS_NOT_CONFIGURED } });
    expect(await submitSupportAsServer(missing, null)(supportArgs)).toEqual({ id: null, error: { code: FORMS_NOT_CONFIGURED } });
    expect(await submitNoticeAsServer(missing)(noticeArgs)).toEqual({ reference: null, error: { code: FORMS_NOT_CONFIGURED } });
  });

  // The functions are closed to anon and signed-in callers from 0074. An
  // action that went back to the user client would fail for every visitor.
  it.each([
    ["app/publish/action.ts", "submitLeadAsServer"],
    ["app/contact/action.ts", "submitSupportAsServer"],
    ["app/takedown/action.ts", "submitNoticeAsServer"],
  ])("%s submits with the service role client", (file, fn) => {
    const src = readFileSync(resolve(__dirname, "..", file), "utf8");
    expect(src).toContain(`${fn}(createAdminClient`);
    expect(src).toContain('from "@/lib/supabase/admin"');
    expect(src).not.toMatch(/\.rpc\(/);
  });
});
