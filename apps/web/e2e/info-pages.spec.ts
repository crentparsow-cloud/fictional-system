import { expect, test } from "@playwright/test";

/**
 * Help centre, trust, plans pages, sitemap and robots (F-009, F-010, F-011,
 * F-121). Signed out, no database writes.
 */

const PAGES = [
  "/help",
  "/help/account",
  "/help/membership",
  "/help/cancelling",
  "/help/refunds",
  "/help/privacy",
  "/help/help-now",
  "/help/check-in-partner",
  "/trust",
  "/pricing",
  "/white-label",
  "/organisations",
] as const;

for (const path of PAGES) {
  test(`${path} loads with one h1 and the info footer`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.locator("main h1")).toHaveCount(1);
    await expect(page.locator(".info-footer-links a[href='/help-now']")).toBeVisible();
  });
}

test("help pages carry Help now and say Akana is not a crisis service", async ({ page }) => {
  for (const path of ["/help", "/help/refunds"]) {
    await page.goto(path);
    await expect(page.locator("main a.help-now-btn")).toBeVisible();
    await expect(page.locator("main")).toContainText(/not a crisis service/i);
  }
});

test("plans pages say talk to us and link to the enquiry form", async ({ page }) => {
  for (const path of ["/pricing", "/white-label", "/organisations"]) {
    await page.goto(path);
    const cta = page.getByRole("link", { name: "Talk to us" });
    await expect(cta.first()).toHaveAttribute("href", "/publish#enquiry");
  }
});

test("the trust page lists what is enforced and what is never collected", async ({ page }) => {
  await page.goto("/trust");
  await expect(page.getByRole("heading", { name: "Your answers are sealed" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What we never collect" })).toBeVisible();
});

test("canonical links are absolute", async ({ page }) => {
  await page.goto("/trust");
  const href = await page.locator("link[rel='canonical']").getAttribute("href");
  expect(href).toMatch(/^https?:\/\/[^/]+\/trust$/);
});

test("robots.txt keeps crawlers out of private routes and names the sitemap", async ({ request }) => {
  const res = await request.get("/robots.txt");
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body).toMatch(/Disallow: \/you/);
  expect(body).toMatch(/Disallow: \/api\//);
  expect(body).toMatch(/Sitemap: https?:\/\/.+\/sitemap\.xml/);
});

test("sitemap.xml lists public pages with en-GB and en-US alternates and no private or demo pages", async ({ request }) => {
  const res = await request.get("/sitemap.xml");
  expect(res.status()).toBe(200);
  const xml = await res.text();
  for (const p of ["/help", "/trust", "/pricing", "/legal/terms", "/themes", "/authors", "/publishers"]) expect(xml).toContain(`${p}</loc>`);
  expect(xml).toContain('hreflang="en-GB"');
  expect(xml).toContain('hreflang="en-US"');
  for (const p of ["/you", "/read/", "/admin", "/api/", "/respond/"]) expect(xml).not.toContain(`${p}`);
});
