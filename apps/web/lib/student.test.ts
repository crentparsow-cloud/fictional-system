import { describe, expect, it } from "vitest";
import {
  discountedMinor,
  discountIsCoupon,
  emailDomain,
  hashEmail,
  isAcademicEmail,
  studentCouponId,
  studentDiscountApplies,
  studentEnabled,
  studentPercentFrom,
  studentPlanAllowed,
  studentStatus,
  studentSuffixes,
  studentVerifyHoursFrom,
} from "@/lib/student";

describe("the switch", () => {
  it("is off while the coupon id is blank", () => {
    expect(studentEnabled({})).toBe(false);
    expect(studentEnabled({ STRIPE_COUPON_STUDENT: "   " })).toBe(false);
    expect(studentCouponId({ STRIPE_COUPON_STUDENT: "not a valid id!" })).toBeNull();
  });
  it("is on with a coupon id", () => {
    expect(studentEnabled({ STRIPE_COUPON_STUDENT: "STUDENT50" })).toBe(true);
    expect(studentCouponId({ STRIPE_COUPON_STUDENT: " abc_123 " })).toBe("abc_123");
  });
});

describe("the suffix list", () => {
  it("defaults to .ac.uk and .edu", () => {
    expect(studentSuffixes({})).toEqual([".ac.uk", ".edu"]);
  });
  it("reads a configured list, adds the dot and drops rubbish", () => {
    expect(studentSuffixes({ STUDENT_EMAIL_SUFFIXES: "ac.uk, .EDU ; edu.au  bad!suffix" })).toEqual([".ac.uk", ".edu", ".edu.au"]);
    expect(studentSuffixes({ STUDENT_EMAIL_SUFFIXES: "!!!" })).toEqual([".ac.uk", ".edu"]);
  });
});

describe("isAcademicEmail", () => {
  it("accepts addresses ending in an accepted suffix", () => {
    expect(isAcademicEmail("sam@student.ox.ac.uk")).toBe(true);
    expect(isAcademicEmail("Sam@MIT.EDU")).toBe(true);
    expect(isAcademicEmail(" sam@uni.edu ")).toBe(true);
  });
  it("refuses everything else", () => {
    expect(isAcademicEmail("sam@gmail.com")).toBe(false);
    expect(isAcademicEmail("sam@ac.uk")).toBe(false);
    expect(isAcademicEmail("sam@evil-ac.uk")).toBe(false);
    expect(isAcademicEmail("sam@uni.ac.uk.evil.com")).toBe(false);
    expect(isAcademicEmail("sam@.ac.uk")).toBe(false);
    expect(isAcademicEmail("sam@uni..ac.uk")).toBe(false);
    expect(isAcademicEmail("not an email")).toBe(false);
    expect(isAcademicEmail(undefined)).toBe(false);
    expect(isAcademicEmail(`${"a".repeat(250)}@uni.edu`)).toBe(false);
  });
  it("honours a configured list", () => {
    expect(isAcademicEmail("sam@uni.edu.au", [".edu.au"])).toBe(true);
    expect(isAcademicEmail("sam@uni.edu", [".edu.au"])).toBe(false);
  });
  it("finds the domain", () => {
    expect(emailDomain("Sam@Uni.EDU")).toBe("uni.edu");
    expect(emailDomain("nope")).toBeNull();
  });
});

describe("hashing", () => {
  it("hashes the lower-cased address to 64 hex characters", async () => {
    const a = await hashEmail("Sam@Uni.EDU ");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(await hashEmail("sam@uni.edu"));
    expect(a).not.toBe(await hashEmail("sam2@uni.edu"));
  });
});

describe("config", () => {
  it("reads the percentage and the link life", () => {
    expect(studentPercentFrom([{ key: "student_discount_percent", value: 40 }])).toBe(40);
    expect(studentPercentFrom(null)).toBe(50);
    expect(studentPercentFrom([{ key: "student_discount_percent", value: 0 }])).toBe(50);
    expect(studentVerifyHoursFrom([{ key: "student_verify_hours", value: 2 }])).toBe(2);
    expect(studentVerifyHoursFrom(null)).toBe(24);
  });
});

describe("the yearly check", () => {
  const now = new Date("2026-10-21T10:00:00Z");
  it("has nothing for a reader who never verified", () => {
    expect(studentStatus(null, now)).toEqual({ kind: "none" });
    expect(studentStatus({ verified_at: null, expires_at: null }, now)).toEqual({ kind: "none" });
  });
  it("is running with a year to go", () => {
    const s = studentStatus({ verified_at: "2026-10-01T00:00:00Z", expires_at: "2027-10-01T00:00:00Z" }, now);
    expect(s).toEqual({ kind: "verified", expiresAt: "2027-10-01T00:00:00Z", renewSoon: false });
    expect(studentDiscountApplies(s)).toBe(true);
  });
  it("asks to renew inside the last month", () => {
    const s = studentStatus({ verified_at: "2025-11-01T00:00:00Z", expires_at: "2026-11-10T00:00:00Z" }, now);
    expect(s).toMatchObject({ kind: "verified", renewSoon: true });
  });
  it("lapses on the end date, and the discount stops applying", () => {
    const s = studentStatus({ verified_at: "2025-10-01T00:00:00Z", expires_at: "2026-10-21T10:00:00Z" }, now);
    expect(s.kind).toBe("expired");
    expect(studentDiscountApplies(s)).toBe(false);
  });
});

describe("plans and prices", () => {
  it("covers the single-person plans only", () => {
    expect(studentPlanAllowed("monthly")).toBe(true);
    expect(studentPlanAllowed("yearly")).toBe(true);
    expect(studentPlanAllowed("two_monthly")).toBe(false);
    expect(studentPlanAllowed("two_yearly")).toBe(false);
  });
  it("halves a price for display", () => {
    expect(discountedMinor(799, 50)).toBe(400);
    expect(discountedMinor(6999, 50)).toBe(3500);
    expect(discountedMinor(1000, 25)).toBe(750);
  });
});

describe("discountIsCoupon", () => {
  it("reads the older and the newer Stripe shapes", () => {
    expect(discountIsCoupon({ coupon: { id: "STUDENT50" } }, "STUDENT50")).toBe(true);
    expect(discountIsCoupon({ source: { type: "coupon", coupon: "STUDENT50" } }, "STUDENT50")).toBe(true);
    expect(discountIsCoupon({ source: { coupon: { id: "STUDENT50" } } }, "STUDENT50")).toBe(true);
    expect(discountIsCoupon({ coupon: { id: "OTHER" } }, "STUDENT50")).toBe(false);
    expect(discountIsCoupon(null, "STUDENT50")).toBe(false);
    expect(discountIsCoupon("di_1", "STUDENT50")).toBe(false);
  });
});
