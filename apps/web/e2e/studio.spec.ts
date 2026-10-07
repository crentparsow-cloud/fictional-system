import { expect, test } from "@playwright/test";

/**
 * Author Studio and console (F-033, F-055). Signed out, the Studio and the
 * console send people to sign-in. An invitation link that is malformed or
 * unknown shows a calm page that names nobody, and the response never
 * sends a referrer or gets cached.
 */

for (const path of ["/studio", "/studio/books", "/studio/profile", "/console", "/console/authors"]) {
  test(`${path} asks a signed-out visitor to sign in`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`/sign-in\\?next=${encodeURIComponent(path).replace(/\//g, "%2F")}`));
  });
}

for (const path of ["/studio/join/not-a-token", "/studio/join/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"]) {
  test(`invitation link ${path.length > 30 ? "unknown" : "malformed"} shows a calm page`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response!.status()).toBeLessThan(500);
    const h = response!.headers();
    expect(h["referrer-policy"]).toBe("no-referrer");
    expect(h["cache-control"]).toMatch(/no-store/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("This link isn't working");
    await expect(page.getByRole("button", { name: /accept/i })).toHaveCount(0);
    expect(await page.locator('meta[name="robots"]').getAttribute("content")).toMatch(/noindex/);
  });
}
