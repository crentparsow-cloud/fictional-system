import { expect, test, type Page } from "@playwright/test";
import { DATA_PUBLIC_PAGES, GATED_PAGES, PUBLIC_PAGES, discoverDataPages, signInFor } from "./helpers";

/**
 * Public pages load for a signed-out visitor with a 200 and a visible main
 * heading. Heading text is checked only where it is part of the contract
 * (Help now and Sign in); other pages are being rewritten in parallel, so
 * only the presence of one visible, non-empty h1 inside <main> is asserted.
 */

async function expectMainHeading(page: Page, path: string) {
  const response = await page.goto(path);
  expect(response, "no response").not.toBeNull();
  expect(response!.status()).toBe(200);

  const main = page.locator("main");
  await expect(main.first()).toBeVisible();

  const h1 = main.first().getByRole("heading", { level: 1 });
  await expect(h1).toHaveCount(1);
  await expect(h1).toBeVisible();
  await expect(h1).toHaveText(/\S/);
}

for (const path of PUBLIC_PAGES) {
  test(`${path} loads with a 200 and a main heading`, async ({ page }) => {
    await expectMainHeading(page, path);
  });
}

// Pages that read the catalogue. The local build has no database, so these
// run against a deployed site only.
test.describe("catalogue pages", () => {
  test.skip(!process.env.E2E_BASE_URL, "needs a deployed site with catalogue data");

  for (const path of DATA_PUBLIC_PAGES) {
    test(`${path} loads with a 200 and a main heading`, async ({ page }) => {
      await expectMainHeading(page, path);
    });
  }

  test("a shelf, a live title and a try-it title load with a 200 and a main heading", async ({ page }) => {
    const found = await discoverDataPages(page);
    test.skip(!found.shelf && !found.workbook, "no shelf or title is live on this site");
    for (const path of [found.shelf, found.workbook, found.tryTitle]) {
      if (path) await expectMainHeading(page, path);
    }
  });
});

test("/help-now heading says Help now", async ({ page }) => {
  await page.goto("/help-now");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/help now/i);
});

test("/sign-in heading says Sign in", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/sign in/i);
});

for (const path of GATED_PAGES) {
  test(`${path} sends a signed-out visitor to sign-in with next=${path}`, async ({ request }) => {
    const response = await request.get(path, { maxRedirects: 0 });
    expect([302, 303, 307, 308]).toContain(response.status());
    const location = response.headers()["location"];
    expect(location, "redirect has no Location header").toBeTruthy();
    const target = new URL(location!, "http://placeholder.invalid");
    expect(target.pathname + target.search).toBe(signInFor(path));
  });

  test(`${path} in a browser lands on the sign-in page`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response!.status()).toBe(200);
    const url = new URL(page.url());
    expect(url.pathname + url.search).toBe(signInFor(path));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/sign in/i);
  });
}

// Outside the reader group on purpose: that group sends a signed-out visitor to sign-in before the page runs.
// Explore itself reads the catalogue, so with the placeholder Supabase settings it is not in PUBLIC_PAGES.
test("/library redirects to /explore, so old links keep working", async ({ request }) => {
  const response = await request.get("/library", { maxRedirects: 0 });
  expect([301, 302, 307, 308]).toContain(response.status());
  const target = new URL(response.headers()["location"]!, "http://placeholder.invalid");
  expect(target.pathname).toBe("/explore");
});
