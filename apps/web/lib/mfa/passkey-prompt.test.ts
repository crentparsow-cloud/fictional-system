import { describe, expect, it } from "vitest";
import { passkeyPromptDue } from "@/lib/mfa/passkey-prompt";

const base = { readerFlag: true, passkeysOpen: true, verifiedFactors: 0, dismissed: false };

describe("passkeyPromptDue", () => {
  it("shows to a reader with no factor who has not dismissed it", () => {
    expect(passkeyPromptDue(base)).toBe(true);
  });
  it("stays hidden when either switch is off", () => {
    expect(passkeyPromptDue({ ...base, readerFlag: false })).toBe(false);
    expect(passkeyPromptDue({ ...base, passkeysOpen: false })).toBe(false);
  });
  it("stays hidden once the reader has any second factor", () => {
    expect(passkeyPromptDue({ ...base, verifiedFactors: 1 })).toBe(false);
  });
  it("stays hidden after it is dismissed", () => {
    expect(passkeyPromptDue({ ...base, dismissed: true })).toBe(false);
  });
});
