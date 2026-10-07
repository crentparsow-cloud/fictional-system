import { expect, test } from "@playwright/test";

/**
 * Author, publisher and Theme pages (F-006, F-007). The local project runs
 * with placeholder Supabase settings, so only the checks that need no data
 * run there: malformed slugs are a 404 before any query, and the short /t/
 * link redirects. The data checks run against a deployed site (remote).
 */

for (const path of ["/themes/Not_A_Slug", "/authors/Not_A_Slug", "/publishers/not-a-real-imprint"]) {
  test(`${path} is a 404`, async ({ request }) => {
    const response = await request.get(path);
    expect(response.status()).toBe(404);
  });
}

test("/t/{slug} sends readers to the Theme page", async ({ request }) => {
  const response = await request.get("/t/work-worth-choosing", { maxRedirects: 0 });
  expect([301, 308]).toContain(response.status());
  const location = response.headers()["location"];
  expect(location, "redirect has no Location header").toBeTruthy();
  expect(new URL(location!, "http://placeholder.invalid").pathname).toBe("/themes/work-worth-choosing");
});

test("/publishers sends readers to the publisher list", async ({ request }) => {
  const response = await request.get("/publishers", { maxRedirects: 0 });
  expect([301, 308]).toContain(response.status());
  expect(new URL(response.headers()["location"]!, "http://placeholder.invalid").pathname).toBe("/authors");
});

test.describe("with catalogue data", () => {
  // E2E_BASE_URL selects the remote project (playwright.config.ts).
  test.skip(!process.env.E2E_BASE_URL, "needs a deployed site with catalogue data");

  for (const path of ["/themes", "/authors"]) {
    test(`${path} loads with a main heading and a canonical link`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response!.status()).toBe(200);
      await expect(page.locator("main").getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`${path}$`));
    });
  }

  test("a Theme page lists its workbooks with their badges", async ({ page }) => {
    await page.goto("/themes");
    const first = page.locator("a.browse-item").first();
    test.skip((await first.count()) === 0, "no live Themes yet");
    const href = await first.getAttribute("href");
    await first.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/\S/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`${href}$`));
    const cards = page.locator("article.wb-card");
    expect(await cards.count()).toBeGreaterThan(0);
    // Every card keeps its badge, so demo titles stay labelled.
    for (const card of await cards.all()) await expect(card.locator(".badge")).toHaveCount(1);
  });

  test("a demo author is labelled and kept out of search", async ({ page }) => {
    await page.goto("/authors");
    const demo = page.locator("a.browse-item", { has: page.locator(".badge.demo") }).first();
    test.skip((await demo.count()) === 0, "no demo authors live");
    await demo.click();
    await expect(page.locator(".wb-hero .badge.demo")).toHaveText(/demo author/i);
    await expect(page.locator(".demo-note")).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page).toHaveTitle(/\(demo\)/);
  });

  test("the workbook page links its author and Theme", async ({ page }) => {
    await page.goto("/themes");
    const first = page.locator("a.browse-item").first();
    test.skip((await first.count()) === 0, "no live Themes yet");
    await first.click();
    await page.locator("article.wb-card .wb-card-title a").first().click();
    await expect(page.locator(".wb-hero a.chip[href^='/themes/']")).toHaveCount(1);
    const author = page.locator(".wb-hero a.author-link").first();
    if ((await author.count()) > 0) {
      await author.click();
      await expect(page).toHaveURL(/\/authors\/[a-z0-9-]+$/);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(/\S/);
    }
  });
});
