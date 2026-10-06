import { describe, expect, it } from "vitest";
import { cleanTotpCode, confirmedRoles, decideStaffAccess, knownRoles } from "./staff-access";

describe("decideStaffAccess", () => {
  it("sends a signed-out visitor to sign-in, whatever else is set", () => {
    expect(decideStaffAccess({ signedIn: false, roles: [], aal: null })).toBe("signin");
    expect(decideStaffAccess({ signedIn: false, roles: ["owner"], aal: "aal2" })).toBe("signin");
  });

  it("gives a signed-in non-staff account a 404", () => {
    expect(decideStaffAccess({ signedIn: true, roles: [], aal: "aal1" })).toBe("notfound");
    expect(decideStaffAccess({ signedIn: true, roles: [], aal: "aal2" })).toBe("notfound");
  });

  it("does not count unknown roles as staff", () => {
    expect(decideStaffAccess({ signedIn: true, roles: ["admin", "reader", "tenant_admin"], aal: "aal2" })).toBe("notfound");
  });

  it("sends staff without a second factor to MFA", () => {
    expect(decideStaffAccess({ signedIn: true, roles: ["support"], aal: "aal1" })).toBe("mfa");
    expect(decideStaffAccess({ signedIn: true, roles: ["owner"], aal: null })).toBe("mfa");
    expect(decideStaffAccess({ signedIn: true, roles: ["owner"], aal: undefined })).toBe("mfa");
  });

  it("lets staff at aal2 in", () => {
    for (const r of ["owner", "editor", "safety_reviewer", "support", "finance"]) {
      expect(decideStaffAccess({ signedIn: true, roles: [r], aal: "aal2" })).toBe("ok");
    }
  });
});

describe("roles", () => {
  it("keeps known roles once each, in a fixed order", () => {
    expect(knownRoles(["finance", "owner", "owner", 7, null, "bogus"])).toEqual(["owner", "finance"]);
    expect(knownRoles(undefined)).toEqual([]);
  });

  it("needs both the token and the table to agree", () => {
    expect(confirmedRoles(["owner", "finance"], ["owner"])).toEqual(["owner"]);
    expect(confirmedRoles(["owner"], [])).toEqual([]);
    expect(confirmedRoles([], ["owner"])).toEqual([]);
  });
});

describe("cleanTotpCode", () => {
  it("accepts six digits, spaces allowed", () => {
    expect(cleanTotpCode("123456")).toBe("123456");
    expect(cleanTotpCode("123 456")).toBe("123456");
  });
  it("refuses anything else", () => {
    expect(cleanTotpCode("12345")).toBeNull();
    expect(cleanTotpCode("1234567")).toBeNull();
    expect(cleanTotpCode("12a456")).toBeNull();
    expect(cleanTotpCode(null)).toBeNull();
  });
});
