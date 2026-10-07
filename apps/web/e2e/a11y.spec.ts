import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Automated accessibility (F-144, first slice): axe against WCAG 2.2 A and
 * AA rules. Fails on serious or critical violations only. This is not the
 * manual pass; see docs/TESTING.md.
 */

const PAGES = ["/", "/help-now", "/publish"] as const;
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/**
 * Elements with a known, logged defect, left out of the page-wide scan so the
 * rest of the page is still checked. Each one has its own fixme test below.
 */
const KNOWN_DEFECTS: Partial<Record<(typeof PAGES)[number], string[]>> = {};

async function blockingViolations(page: Page, include?: string, exclude: string[] = []) {
  let builder = new AxeBuilder({ page }).withTags(TAGS);
  if (include) builder = builder.include(include);
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

for (const path of PAGES) {
  test(`${path} has no serious or critical axe violations`, async ({ page }) => {
    await page.goto(path);
    const found = await blockingViolations(page, undefined, KNOWN_DEFECTS[path] ?? []);
    expect(found, `axe violations on ${path}`).toEqual([]);
  });
}

// Regression check: the approval note on the home hero once inherited the
// hero's white ink on marigold (1.79:1). Fixed 7 October 2026 by scoping the
// rule as `.hero .home-approval`, which gives --marigold-ink at 7.72:1.
test("/ approval note meets colour contrast", async ({ page }) => {
  await page.goto("/");
  const note = page.locator(".home-approval");
  test.skip((await note.count()) === 0, "no approval note on this build");
  const found = await blockingViolations(page, ".home-approval");
  expect(found).toEqual([]);
});
