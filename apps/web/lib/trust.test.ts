import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NEVER_COLLECT, TRUST_CLAIMS } from "@/lib/trust";

// vitest runs from apps/web; the repo root is two levels up.
const ROOT = path.join(process.cwd(), "..", "..");

describe("trust page claims (F-121)", () => {
  const all = [...TRUST_CLAIMS, ...NEVER_COLLECT];

  it("names at least one enforcing file for every claim", () => {
    for (const c of all) expect(c.enforcedBy.length, c.title).toBeGreaterThan(0);
  });

  it("names only files that exist", () => {
    for (const c of all) {
      for (const f of c.enforcedBy) expect(existsSync(path.join(ROOT, f)), `${c.title}: ${f}`).toBe(true);
    }
  });

  it("uses plain house style: no em dashes, no claim words", () => {
    for (const c of all) {
      const text = `${c.title} ${c.body}`;
      expect(text).not.toMatch(/—/);
      expect(text).not.toMatch(/\b(cure|treat|therapy|diagnos|guarantee|100%|military-grade|unhackable)/i);
    }
  });
});
