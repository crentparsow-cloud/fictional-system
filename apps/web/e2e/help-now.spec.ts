import { expect, test } from "@playwright/test";

/**
 * Help now (safety floor): the page lists phone lines a reader can tap, and
 * every tel: link says what it is to a screen reader.
 */

test("/help-now has tel: links, each with an accessible name", async ({ page }) => {
  await page.goto("/help-now");

  const links = page.locator('a[href^="tel:"]');
  const count = await links.count();
  expect(count, "no tel: links on /help-now").toBeGreaterThan(0);

  for (let i = 0; i < count; i++) {
    const link = links.nth(i);
    const href = await link.getAttribute("href");
    // A dialable number: digits, optionally a leading +, nothing else.
    expect(href, `tel: link ${i} is not dialable`).toMatch(/^tel:\+?\d{3,15}$/);
    await expect(link, `tel: link ${href} has no accessible name`).toHaveAccessibleName(/\S/);
  }
});

// The market comes from ?m=, then Accept-Language, then GB. Desktop Chrome
// sends en-US, so the default run shows 911; a UK browser must see 999.
test("/help-now offers emergency services first", async ({ page }) => {
  await page.goto("/help-now");
  const first = page.locator('a[href^="tel:"]').first();
  await expect(first).toBeVisible();
  await expect(first).toHaveAccessibleName(/emergency/i);
});

test.describe("UK browser", () => {
  test.use({ locale: "en-GB" });
  test("/help-now shows 999 for a UK reader", async ({ page }) => {
    await page.goto("/help-now");
    await expect(page.locator('a[href="tel:999"]').first()).toBeVisible();
  });
});
