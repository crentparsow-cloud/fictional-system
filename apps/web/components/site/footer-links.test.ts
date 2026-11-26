import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { INFO_FOOTER_LINKS } from "@/components/InfoFooter";
import { SITE_FOOTER_COLUMNS } from "@/components/site/SiteFooter";

/**
 * Review finding M23: the page that explains first-party counting and holds
 * its opt-out was linked from nowhere. Both footers must link it.
 */
describe("the counting opt-out is linked from the footers", () => {
  it("the page exists", () => {
    expect(existsSync(join(__dirname, "..", "..", "app", "counting", "page.tsx"))).toBe(true);
  });

  it("the site footer links it, in the Legal column beside the cookie statement", () => {
    const legal = SITE_FOOTER_COLUMNS.find((c) => c.title === "Legal");
    const hrefs = (legal?.links ?? []).map(([, href]) => href as string);
    expect(hrefs).toContain("/counting");
    expect(hrefs.indexOf("/counting")).toBe(hrefs.indexOf("/legal/cookies") + 1);
    expect((legal?.links ?? []).find(([, href]) => href === "/counting")?.[0]).toBe("What we count");
  });

  it("the footer on help, trust and legal pages links it too", () => {
    expect(INFO_FOOTER_LINKS.map((l) => l.href as string)).toContain("/counting");
  });
});
