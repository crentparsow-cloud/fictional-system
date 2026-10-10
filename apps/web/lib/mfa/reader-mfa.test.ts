import { describe, expect, it } from "vitest";
import { readerVerifyHref, securityNoticeText } from "@/lib/mfa/reader-mfa";

describe("reader two-step sign-in", () => {
  it("sends a reader to /verify with reader copy and a same-site return path", () => {
    expect(readerVerifyHref("/today")).toBe("/verify?for=reader&next=%2Ftoday");
    expect(readerVerifyHref("https://evil.example")).toBe("/verify?for=reader&next=%2Fhome");
    expect(readerVerifyHref("//evil.example")).toBe("/verify?for=reader&next=%2Fhome");
  });
  it("shows a notice only for a known code", () => {
    expect(securityNoticeText("off")).toMatch(/off/);
    expect(securityNoticeText(["recovered"])).toMatch(/recovery code/);
    expect(securityNoticeText("nope")).toBeNull();
    expect(securityNoticeText(undefined)).toBeNull();
  });
});
