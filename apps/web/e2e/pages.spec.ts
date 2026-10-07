import { expect, test } from "@playwright/test";
import { GATED_PAGES, PUBLIC_PAGES, signInFor } from "./helpers";

/**
 * Public pages load for a signed-out visitor with a 200 and a visible main
 * heading. Heading text is checked only where it is part of the contract
 * (Help now and Sign in); other pages are being rewritten in parallel, so
 * only the presence of one visible, non-empty h1 inside <main> is asserted.
 */

for (const path of PUBLIC_PAGES) {
  test(`${path} loads with a 200 and a main heading`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response, "no response").not.toBeNull();
    expect(response!.status()).toBe(200);

    const main = page.locator("main");
    await expect(main.first()).toBeVisible();

    const h1 = main.first().getByRole("heading", { level: 1 });
    await expect(h1).toHaveCount(1);
    await expect(h1).toBeVisible();
    await expect(h1).toHaveText(/\S/);
  });
}

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
