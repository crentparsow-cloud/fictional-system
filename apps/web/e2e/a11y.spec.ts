import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readdirSync } from "node:fs";
import path from "node:path";
import { LEGAL_SLUGS } from "../lib/legal-docs";

/**
 * Automated accessibility sweep (F-144). axe with the WCAG 2.0, 2.1 and 2.2
 * A and AA rules on every public and signed-out page, in light and dark,
 * at phone (320px) and desktop widths. Fails on serious or critical
 * violations. A second check per page asks for one main landmark, one h1
 * and all content inside landmarks.
 *
 * This is the automated part only. The manual keyboard, VoiceOver and
 * TalkBack pass is in docs/ACCESSIBILITY.md.
 *
 * Pages that need catalogue data (Themes, authors, workbook pages) run on
 * the remote project only, because the local build has no database.
 */

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const STRUCTURE_RULES = ["landmark-one-main", "page-has-heading-one", "region"];

// apps/web is the working directory when Playwright runs.
const CONTENT = path.join(process.cwd(), "..", "..", "content");
const listCodes = (dir: string, ext: string) =>
  readdirSync(path.join(CONTENT, dir))
    .filter((f) => f.endsWith(ext))
    .map((f) => f.slice(0, -ext.length))
    .sort();

/** Pages that render with no database. They run everywhere. */
const STATIC_PAGES: string[] = [
  "/",
  "/search",
  "/search?q=sleep",
  "/help",
  ...listCodes("help", ".md").map((t) => `/help/${t}`),
  "/trust",
  "/pricing",
  "/white-label",
  "/organisations",
  "/publish",
  "/contact",
  "/counting",
  "/takedown",
  "/takedown/counter",
  ...LEGAL_SLUGS.map((d) => `/legal/${d}`),
  ...listCodes("public-domain", ".json").map((c) => `/public-domain/${c}`),
  "/help-now",
  "/help-offline",
  "/sign-in",
  "/respond/not-a-real-token",
  "/studio/join/not-a-real-token",
  "/org/join/not-a-real-token",
  "/this-page-does-not-exist",
];

/** Pages that need catalogue data. Remote only. */
const DATA_PAGES: string[] = ["/themes", "/authors"];

const VARIANTS = [
  { name: "light, phone", colorScheme: "light", viewport: { width: 320, height: 640 } },
  { name: "dark, phone", colorScheme: "dark", viewport: { width: 320, height: 640 } },
  { name: "light, desktop", colorScheme: "light", viewport: { width: 1280, height: 800 } },
  { name: "dark, desktop", colorScheme: "dark", viewport: { width: 1280, height: 800 } },
] as const;

/**
 * Elements with a known, logged defect, left out of the page-wide scan so the
 * rest of the page is still checked. Each one needs its own fixme test.
 */
const KNOWN_DEFECTS: Record<string, string[]> = {};

async function blockingViolations(page: Page, exclude: string[] = []) {
  let builder = new AxeBuilder({ page }).withTags(TAGS);
  for (const selector of exclude) builder = builder.exclude(selector);
  const results = await builder.analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({
      rule: v.id,
      impact: v.impact,
      help: v.help,
      targets: v.nodes.slice(0, 5).map((n) => n.target.join(" ")),
    }));
}

async function structureViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withRules(STRUCTURE_RULES).analyze();
  return results.violations.map((v) => ({ rule: v.id, targets: v.nodes.slice(0, 5).map((n) => n.target.join(" ")) }));
}

/** The first same-site link on a page whose path starts with the prefix. */
async function firstLink(page: Page, prefix: string): Promise<string | null> {
  const hrefs = await page.locator(`main a[href^="${prefix}"]`).evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
  return hrefs.find((h) => h.length > prefix.length && !h.includes("#")) ?? null;
}

for (const variant of VARIANTS) {
  test.describe(`axe, ${variant.name}`, () => {
    test.use({ colorScheme: variant.colorScheme, viewport: variant.viewport });

    for (const route of STATIC_PAGES) {
      test(`${route} has no serious or critical violations`, async ({ page }) => {
        await page.goto(route);
        const found = await blockingViolations(page, KNOWN_DEFECTS[route]);
        expect(found, `axe violations on ${route} (${variant.name})`).toEqual([]);
      });
    }

    test.describe("with catalogue data", () => {
      test.skip(!process.env.E2E_BASE_URL, "needs a deployed site with catalogue data");

      for (const route of DATA_PAGES) {
        test(`${route} has no serious or critical violations`, async ({ page }) => {
          await page.goto(route);
          expect(await blockingViolations(page, KNOWN_DEFECTS[route]), `axe violations on ${route}`).toEqual([]);
        });
      }

      test("a Theme page, an author page and a workbook page have no serious or critical violations", async ({ page }) => {
        // E2E_WORKBOOK_SLUG names a workbook to check; otherwise the first
        // one linked from the first Theme is used.
        await page.goto("/themes");
        const theme = await firstLink(page, "/themes/");
        test.skip(!theme, "no Theme is listed on this site");
        await page.goto(theme!);
        expect(await blockingViolations(page), `axe violations on ${theme}`).toEqual([]);

        const fromTheme = await firstLink(page, "/w/");
        const workbook = process.env.E2E_WORKBOOK_SLUG ? `/w/${process.env.E2E_WORKBOOK_SLUG}` : fromTheme;
        if (workbook) {
          await page.goto(workbook);
          expect(await blockingViolations(page), `axe violations on ${workbook}`).toEqual([]);
        }

        await page.goto("/authors");
        const author = await firstLink(page, "/authors/");
        if (author) {
          await page.goto(author);
          expect(await blockingViolations(page), `axe violations on ${author}`).toEqual([]);
        }
      });
    });
  });
}

test.describe("page structure", () => {
  for (const route of STATIC_PAGES) {
    test(`${route} has one main landmark, one h1 and no content outside landmarks`, async ({ page }) => {
      await page.goto(route);
      expect(await structureViolations(page), `structure on ${route}`).toEqual([]);
    });
  }
});
