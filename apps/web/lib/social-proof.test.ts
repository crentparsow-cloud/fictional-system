import { describe, expect, it } from "vitest";
import { proofFloor, proofMinFrom, proofTtlHoursFrom, siteProofLine, workbookProofLine, type ProofRow } from "./social-proof";

const NOW = new Date("2026-11-01T12:00:00Z");
const opts = { now: NOW, min: 100, ttlHours: 26 };
const row = (over: Partial<ProofRow> = {}): ProofRow => ({ scope: "readers_started", workbook_id: "w1", readers: 347, computed_at: "2026-11-01T04:00:00Z", ...over });

describe("the threshold", () => {
  it("never goes below 100, whatever the config says", () => {
    expect(proofMinFrom([{ key: "social_proof_min", value: 5 }])).toBe(100);
    expect(proofMinFrom([{ key: "social_proof_min", value: 250 }])).toBe(250);
    expect(proofMinFrom([])).toBe(100);
    expect(proofMinFrom(null)).toBe(100);
  });
  it("reads the freshness window and falls back", () => {
    expect(proofTtlHoursFrom([{ key: "social_proof_ttl_hours", value: 48 }])).toBe(48);
    expect(proofTtlHoursFrom([{ key: "social_proof_ttl_hours", value: 0 }])).toBe(26);
  });
});

describe("rounding", () => {
  it("rounds down to the nearest hundred", () => {
    expect(proofFloor(347, 100)).toBe(300);
    expect(proofFloor(101, 100)).toBe(100);
    expect(proofFloor(1999, 100)).toBe(1900);
  });
  it("says nothing at or below the threshold", () => {
    expect(proofFloor(100, 100)).toBeNull();
    expect(proofFloor(99, 100)).toBeNull();
    expect(proofFloor(0, 100)).toBeNull();
    expect(proofFloor(300, 300)).toBeNull();
  });
  it("says nothing for a count that is not a whole number", () => {
    expect(proofFloor(Number.NaN, 100)).toBeNull();
    expect(proofFloor(150.5, 100)).toBeNull();
  });
});

describe("the lines", () => {
  it("states a real workbook count", () => {
    expect(workbookProofLine([row()], "w1", opts)).toBe("More than 300 readers have started this workbook.");
  });
  it("shows nothing for another workbook or no row", () => {
    expect(workbookProofLine([row()], "w2", opts)).toBeNull();
    expect(workbookProofLine([], "w1", opts)).toBeNull();
    expect(workbookProofLine(null, "w1", opts)).toBeNull();
  });
  it("shows nothing when the count is stale", () => {
    expect(workbookProofLine([row({ computed_at: "2026-10-29T04:00:00Z" })], "w1", opts)).toBeNull();
  });
  it("shows nothing when the count claims to be from the future", () => {
    expect(workbookProofLine([row({ computed_at: "2026-11-05T04:00:00Z" })], "w1", opts)).toBeNull();
  });
  it("shows nothing when a row is at or below the threshold", () => {
    expect(workbookProofLine([row({ readers: 90 })], "w1", opts)).toBeNull();
  });
  it("states the site count with a thousands separator", () => {
    expect(siteProofLine([row({ scope: "readers_total", workbook_id: null, readers: 12_450 })], opts)).toBe("More than 12,400 readers use Akana.");
  });
  it("does not mix the scopes", () => {
    expect(siteProofLine([row()], opts)).toBeNull();
  });
});
