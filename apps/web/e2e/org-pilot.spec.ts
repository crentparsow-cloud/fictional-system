import { expect, test } from "@playwright/test";

/**
 * Akana for organisations, the manual-sales pilot (F-203, F-204, F-206).
 * Signed out, the organisation console sends people to sign-in. A seat or
 * owner invitation link that is malformed or unknown shows a calm page that
 * names nobody and offers nothing to accept, and the response is never
 * cached and never sends a referrer. The public page names no price.
 */

test("/org asks a signed-out visitor to sign in", async ({ page }) => {
  await page.goto("/org");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Forg/);
});

for (const path of [
  "/org/join/not-a-token",
  "/org/join/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  "/org/admin-join/not-a-token",
  "/org/admin-join/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
]) {
  test(`invitation link ${path} shows a calm page`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response!.status()).toBeLessThan(500);
    const h = response!.headers();
    expect(h["referrer-policy"]).toBe("no-referrer");
    expect(h["cache-control"]).toMatch(/no-store/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("This link isn't working");
    await expect(page.getByRole("button", { name: /accept|take the place/i })).toHaveCount(0);
    expect(await page.locator('meta[name="robots"]').getAttribute("content")).toMatch(/noindex/);
  });
}

test("the organisations page states the privacy line, adults only and no price", async ({ page }) => {
  await page.goto("/organisations");
  const body = page.locator("main");
  await expect(body).toContainText("never who wrote what");
  await expect(body).toContainText("18 or over");
  await expect(body).toContainText("You invite your people by email");
  await expect(body).not.toContainText("£");
  await expect(body).not.toContainText(/church offer|Bible study/i);
});
