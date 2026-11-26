import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { isClaimToken } from "@/lib/gift";
import { claimTokenHash, deriveClaimToken, giftLinkSecret, openGiftLink } from "@/lib/gift-link";

vi.mock("server-only", () => ({}));

describe("gift claim links without a stored token", () => {
  it("derives the same URL-safe token for the same session and secret", () => {
    const a = deriveClaimToken("cs_test_1", "secret-one");
    expect(a).toBe(deriveClaimToken("cs_test_1", "secret-one"));
    expect(a).toHaveLength(43);
    expect(isClaimToken(a)).toBe(true);
    expect(deriveClaimToken("cs_test_2", "secret-one")).not.toBe(a);
    expect(deriveClaimToken("cs_test_1", "secret-two")).not.toBe(a);
    // Not guessable from the session id alone.
    expect(a).not.toContain("cs_test_1");
  });

  it("hashes a token the way the database does (SHA-256, hex)", () => {
    expect(claimTokenHash("abc")).toBe(createHash("sha256").update("abc").digest("hex"));
    expect(claimTokenHash("abc")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("uses GIFT_LINK_SECRET, and the service role key while that is blank", () => {
    expect(giftLinkSecret({ GIFT_LINK_SECRET: " own ", SUPABASE_SERVICE_ROLE_KEY: "svc" })).toBe("own");
    expect(giftLinkSecret({ GIFT_LINK_SECRET: "", SUPABASE_SERVICE_ROLE_KEY: "svc" })).toBe("svc");
    expect(giftLinkSecret({})).toBeNull();
  });

  it("registers the hash, never the token, before handing the link out", async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    const token = await openGiftLink({ rpc }, { id: "g1", sessionId: "cs_test_1" }, "secret-one");
    expect(token).toBe(deriveClaimToken("cs_test_1", "secret-one"));
    expect(rpc).toHaveBeenCalledWith("gift_link_register", { p_id: "g1", p_token_hash: claimTokenHash(token!) });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(token!);
  });

  it("hands out no link when the gift is not waiting, the database refuses or nothing is configured", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await openGiftLink({ rpc: async () => ({ data: false, error: null }) }, { id: "g1", sessionId: "cs_1" }, "s")).toBeNull();
    expect(await openGiftLink({ rpc: async () => ({ data: null, error: { code: "42501" } }) }, { id: "g1", sessionId: "cs_1" }, "s")).toBeNull();
    const rpc = vi.fn();
    expect(await openGiftLink({ rpc }, { id: "g1", sessionId: "cs_1" }, null)).toBeNull();
    expect(await openGiftLink({ rpc }, { id: "g1", sessionId: null }, "s")).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
    quiet.mockRestore();
  });
});
