import { describe, expect, it } from "vitest";
import { HELP_TOPICS, helpPageFrom, isHelpTopic, listHelpPages, supportContact } from "./help";

describe("help centre (F-010)", () => {
  const pages = listHelpPages();

  it("has a page for every topic, each with a title and a summary", () => {
    expect(pages.map((p) => p.slug)).toEqual([...HELP_TOPICS]);
    for (const p of pages) {
      expect(p.title.length, p.slug).toBeGreaterThan(0);
      expect(p.summary.length, p.slug).toBeGreaterThan(0);
      expect(p.html).not.toContain("<h1>");
    }
  });

  it("covers account, membership, cancelling, refunds, privacy, Help now and check-in partner", () => {
    for (const t of ["account", "membership", "cancelling", "refunds", "privacy", "help-now", "check-in-partner"]) expect(isHelpTopic(t)).toBe(true);
    expect(isHelpTopic("../secrets")).toBe(false);
  });

  it("says plainly that Akana is not a crisis service", () => {
    const helpNow = pages.find((p) => p.slug === "help-now");
    expect(helpNow?.html).toContain("not a crisis service");
    expect(helpNow?.html).toContain('href="/help-now"');
  });

  it("keeps house style: no em dashes, no claim words, no streak talk", () => {
    for (const p of pages) {
      expect(p.html, p.slug).not.toMatch(/—/);
      expect(p.html, p.slug).not.toMatch(/\b(cure|cures|diagnos\w*|guarantee\w*|streak\w*)\b/i);
    }
  });

  it("links only to pages that exist", () => {
    const known = new Set(["/legal/terms", "/legal/privacy", "/legal/cookies", "/legal/refunds", "/pricing", "/help-now", ...HELP_TOPICS.map((t) => `/help/${t}`)]);
    for (const p of pages) {
      for (const m of p.html.matchAll(/href="([^"]+)"/g)) expect(known.has(m[1] ?? ""), `${p.slug}: ${m[1]}`).toBe(true);
    }
  });

  it("drops the first heading from the body", () => {
    const page = helpPageFrom("account", "# Title\n\nLead line.\n\n## Part\n\nBody.");
    expect(page.title).toBe("Title");
    expect(page.summary).toBe("Lead line.");
    expect(page.html).toBe("<p>Lead line.</p>\n<h2>Part</h2>\n<p>Body.</p>");
  });

  it("uses EMAIL_REPLY_TO for support, or shows a placeholder", () => {
    expect(supportContact({ EMAIL_REPLY_TO: "help@akana.example" })).toEqual({ email: "help@akana.example", label: "help@akana.example" });
    expect(supportContact({ EMAIL_REPLY_TO: "Akana <help@akana.example>" }).email).toBe("help@akana.example");
    expect(supportContact({})).toEqual({ email: null, label: "[support email]" });
    expect(supportContact({ EMAIL_REPLY_TO: "not-an-address" }).email).toBeNull();
  });
});
