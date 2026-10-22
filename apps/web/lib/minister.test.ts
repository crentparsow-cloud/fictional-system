import { describe, expect, it } from "vitest";
import { MINISTER_PLACEHOLDERS, ministerEmail, ministerMailto } from "./minister";

const input = { origin: "https://akana.example/", demoPath: "/try/sample-programme" };

describe("tell your minister (14.34)", () => {
  const email = ministerEmail(input);

  it("includes the demo link and the plans link, on the given origin", () => {
    expect(email.body).toContain("https://akana.example/try/sample-programme");
    expect(email.body).toContain("https://akana.example/organisations");
    expect(email.body).not.toContain("//try");
  });

  it("leaves placeholders for the reader to fill in", () => {
    for (const p of MINISTER_PLACEHOLDERS) expect(email.body).toContain(p);
  });

  it("makes no price, outcome or faith claim and uses no dashes", () => {
    const text = `${email.subject}\n${email.body}`;
    expect(text).not.toMatch(/£|\$|€|per cent|%/);
    expect(text).not.toMatch(/—|–/);
    expect(text).not.toMatch(/\b(cure|guarantee\w*|proven|transform\w*|scripture|bible|sermon)\b/i);
  });

  it("builds a mailto with no recipient that stays within common client limits", () => {
    const href = ministerMailto(email);
    expect(href.startsWith("mailto:?subject=")).toBe(true);
    expect(href.length).toBeLessThan(1900);
    expect(decodeURIComponent(href.split("&body=")[1] ?? "")).toBe(email.body);
  });
});
