import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * 14.1: the signed-in app has four tabs, Today, Explore, My workbooks, You,
 * with the read-aloud bar above them. /library folded into Explore and
 * redirects there. Studio, console, org and admin keep their own navigation.
 */

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

describe("four tabs", () => {
  const tabs = read("../components/ReaderTabs.tsx");
  it("lists exactly Today, Explore, My workbooks and You, in that order", () => {
    const hrefs = [...tabs.matchAll(/href: "([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(["/today", "/explore", "/my-workbooks", "/you"]);
  });

  it("the reader shell and Explore use them, and the nav grid has four columns", () => {
    expect(read("../app/(reader)/layout.tsx")).toContain("<ReaderTabs />");
    expect(read("../app/explore/page.tsx")).toContain("<ReaderTabs />");
    expect(read("../app/globals.css")).toMatch(/\.reader-nav ul \{[^}]*repeat\(4, 1fr\)/);
  });

  it("the labels exist in both locales", () => {
    for (const f of ["en-GB", "en-US"]) {
      const m = JSON.parse(read(`../messages/${f}.json`)) as Record<string, string>;
      expect(m["nav.today"]).toBe("Today");
      expect(m["nav.explore"]).toBe("Explore");
      expect(m["nav.myWorkbooks"]).toBe("My workbooks");
      expect(m["nav.you"]).toBe("You");
    }
  });

  it("Studio, console, org and admin do not use the reader tabs", () => {
    for (const rel of ["../app/studio/layout.tsx", "../app/org/layout.tsx", "../app/admin/layout.tsx", "../app/console/layout.tsx"]) {
      if (existsSync(fileURLToPath(new URL(rel, import.meta.url)))) expect(read(rel)).not.toMatch(/ReaderTabs|ReaderNav/);
    }
  });
});

describe("the read-aloud bar sits above the tabs", () => {
  const css = read("../app/globals.css");
  it("is fixed, clear of the tab bar's height and under the nav in stacking order only by being above it", () => {
    const bar = css.match(/\.ra-bar \{[^}]*\}/)![0];
    const nav = css.match(/\.reader-nav \{[^}]*\}/)![0];
    expect(bar).toMatch(/position: fixed/);
    expect(bar).toMatch(/inset-block-end: calc\(56px \+ env\(safe-area-inset-bottom/);
    // The tab links are at least 56px tall, so the bar's offset clears them.
    expect(css).toMatch(/\.reader-nav a \{[^}]*min-block-size: 56px/);
    expect(nav).toMatch(/inset-block-end: 0/);
  });
});

describe("/library is part of Explore", () => {
  it("redirects to /explore and keeps the query", () => {
    const page = read("../app/library/page.tsx");
    expect(page).toContain("permanentRedirect");
    expect(page).toContain("/explore?");
  });
  it("Explore is public: it does not require a session", () => {
    expect(read("../app/explore/page.tsx")).not.toMatch(/redirect\(["`]\/sign-in/);
  });
  it("no page links to /library any more", () => {
    for (const rel of ["../components/home/sections.ts", "../lib/pricing-page.ts", "../lib/today/server.ts", "../components/start/Quiz.tsx"]) {
      expect(read(rel)).not.toContain('"/library"');
    }
  });
});
