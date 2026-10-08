import { describe, expect, it } from "vitest";
import { isRoleMfaError, roleNeedsMfa, sessionMfaVerified, verifyHref } from "@/lib/mfa/role-mfa";

describe("role second factor", () => {
  it("is needed by owners, finance and staff only", () => {
    expect(roleNeedsMfa("owner")).toBe(true);
    expect(roleNeedsMfa("finance")).toBe(true);
    for (const r of ["editor", "author", "viewer", null, undefined]) expect(roleNeedsMfa(r)).toBe(false);
    expect(roleNeedsMfa("viewer", true)).toBe(true);
  });
  it("passes only at aal2 with a second factor in amr", () => {
    expect(sessionMfaVerified({ aal: "aal2", amr: [{ method: "password", timestamp: 1 }, { method: "totp", timestamp: 2 }] })).toBe(true);
    expect(sessionMfaVerified({ aal: "aal2", amr: [{ method: "mfa/webauthn", timestamp: 2 }] })).toBe(true);
    expect(sessionMfaVerified({ aal: "aal2", amr: ["pwd", "totp"] })).toBe(true);
    expect(sessionMfaVerified({ aal: "aal1", amr: [{ method: "totp", timestamp: 2 }] })).toBe(false);
    expect(sessionMfaVerified({ aal: "aal2", amr: [{ method: "password", timestamp: 1 }] })).toBe(false);
    expect(sessionMfaVerified({ aal: "aal2", amr: [{ method: "mfa/recovery_code", timestamp: 1 }] })).toBe(false);
    expect(sessionMfaVerified({ aal: "aal2", amr: "totp" })).toBe(false);
    expect(sessionMfaVerified(null)).toBe(false);
  });
  it("knows the database error and keeps next on this site", () => {
    expect(isRoleMfaError("AKM01")).toBe(true);
    expect(isRoleMfaError("AKO01")).toBe(false);
    expect(verifyHref("/org/billing?org=x")).toBe("/verify?next=%2Forg%2Fbilling%3Forg%3Dx");
    expect(verifyHref("//evil.example")).toBe("/verify?next=%2Fstudio");
    expect(verifyHref("https://evil.example")).toBe("/verify?next=%2Fstudio");
  });
});
