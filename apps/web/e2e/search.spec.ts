import { expect, test, type Page, type Request } from "@playwright/test";

/**
 * On-device search with Help now first (F-008), on the public /search page.
 * The Library tab carries the same box but sits behind sign-in, and these
 * specs never sign in.
 *
 * The local project runs with placeholder Supabase settings, so the
 * catalogue is empty there. That is the case that matters most for safety:
 * Help now must show on a crisis query even when nothing else matches.
 */

const CARD = '[data-testid="search-help-now"]';
const RESULTS = '[data-testid="catalogue-search-results"]';

async function openSearch(page: Page) {
  await page.goto("/search");
  const input = page.getByRole("searchbox", { name: "Search workbooks" });
  await expect(input).toBeVisible();
  // Wait for hydration: the box only searches once React has attached.
  await page.waitForLoadState("networkidle");
  return input;
}

test("/search has a labelled search box with a 44px target", async ({ page }) => {
  const input = await openSearch(page);
  await expect(input).toHaveAttribute("type", "search");
  await expect(input).toHaveAttribute("autocomplete", "off");
  await expect(input).toHaveAttribute("spellcheck", "false");
  await expect(page.getByRole("search")).toBeVisible();
  const box = await input.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test("a crisis query shows Help now first, even with no other results", async ({ page }) => {
  const input = await openSearch(page);
  await input.fill("I want to die");

  const card = page.locator(CARD);
  await expect(card).toBeVisible();
  await expect(card).toContainText("you are not alone");

  // The card is the very first thing in the results region.
  const first = page.locator(`${RESULTS} > *`).first();
  await expect(first).toHaveAttribute("data-testid", "search-help-now");

  const link = card.getByRole("link", { name: "Open Help now" });
  await expect(link).toHaveAttribute("href", /^\/help-now/);
  const box = await link.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

  // The polite status says Help now comes first.
  await expect(page.getByTestId("catalogue-search-status")).toContainText("Help now is shown first.");
});

for (const q of ["self-harm", "suicidal", "I can't go on", "abuse", "overdose", "I'm in danger"]) {
  test(`"${q}" shows Help now`, async ({ page }) => {
    const input = await openSearch(page);
    await input.fill(q);
    await expect(page.locator(CARD)).toBeVisible();
  });
}

test("an ordinary query does not show Help now", async ({ page }) => {
  const input = await openSearch(page);
  await input.fill("budget");
  await expect(page.getByTestId("catalogue-search-status")).not.toBeEmpty();
  await expect(page.locator(CARD)).toHaveCount(0);
});

test("clearing the box removes the Help now card", async ({ page }) => {
  const input = await openSearch(page);
  await input.fill("suicide");
  await expect(page.locator(CARD)).toBeVisible();
  await input.fill("");
  await expect(page.locator(CARD)).toHaveCount(0);
});

test("the query never leaves the device", async ({ page }) => {
  const input = await openSearch(page);
  const seen: Request[] = [];
  page.on("request", (r) => seen.push(r));

  await input.pressSequentially("kill myself", { delay: 20 });
  await expect(page.locator(CARD)).toBeVisible();
  await input.press("Enter");
  await page.waitForTimeout(800);

  // No request while typing or on Enter: no fetch, no prefetch, no navigation.
  expect(seen.map((r) => `${r.resourceType()} ${r.url()}`)).toEqual([]);
  // And the address bar never carries the query.
  expect(new URL(page.url()).search).toBe("");
});

test.describe("dark mode", () => {
  test.use({ colorScheme: "dark" });
  test("the Help now card is visible in dark mode", async ({ page }) => {
    const input = await openSearch(page);
    await input.fill("self harm");
    const link = page.locator(CARD).getByRole("link", { name: "Open Help now" });
    await expect(link).toBeVisible();
    const [bg, fg] = await link.evaluate((el) => {
      const s = getComputedStyle(el);
      return [s.backgroundColor, s.color];
    });
    expect(bg).not.toBe(fg);
  });
});

test("the search box works with the keyboard alone", async ({ page }) => {
  await openSearch(page);
  const input = page.getByRole("searchbox", { name: "Search workbooks" });
  await input.focus();
  await page.keyboard.type("suicide");
  await page.keyboard.press("Tab");
  await expect(page.locator(CARD).getByRole("link", { name: "Open Help now" })).toBeFocused();
});
