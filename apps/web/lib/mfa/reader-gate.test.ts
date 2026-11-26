import { describe, expect, it, vi } from "vitest";
import { hasSecondFactor, secondFactorMissing, SECOND_FACTOR_REQUIRED } from "@/lib/mfa/reader-gate";

const yes = async () => true;
const no = async () => false;

describe("the reader second-factor rule (review M3)", () => {
  it("allows a reader with no factor at the first factor, without reading the token", async () => {
    const level = vi.fn(no);
    expect(await secondFactorMissing(false, level)).toBe(false);
    expect(level).not.toHaveBeenCalled();
  });
  it("refuses a reader with a verified factor whose session is at aal1", async () => {
    expect(await secondFactorMissing(true, no)).toBe(true);
  });
  it("allows a reader with a verified factor whose session is at aal2", async () => {
    expect(await secondFactorMissing(true, yes)).toBe(false);
  });
  it("names the refusal with one code", () => {
    expect(SECOND_FACTOR_REQUIRED).toBe("second_factor_required");
  });
});

describe("what counts as a second factor", () => {
  it("counts a verified authenticator and ignores an unverified one", async () => {
    expect(await hasSecondFactor([{ factor_type: "totp", status: "verified" }], no)).toBe(true);
    expect(await hasSecondFactor([{ factor_type: "totp", status: "unverified" }], yes)).toBe(false);
    expect(await hasSecondFactor([], yes)).toBe(false);
    expect(await hasSecondFactor(undefined, yes)).toBe(false);
  });
  it("counts a passkey only while passkeys are switched on", async () => {
    const passkey = [{ factor_type: "webauthn", status: "verified" }];
    expect(await hasSecondFactor(passkey, yes)).toBe(true);
    expect(await hasSecondFactor(passkey, no)).toBe(false);
  });
  it("does not ask about passkeys when an authenticator already decides", async () => {
    const asked = vi.fn(yes);
    await hasSecondFactor([{ factor_type: "totp", status: "verified" }], asked);
    expect(asked).not.toHaveBeenCalled();
  });
});
