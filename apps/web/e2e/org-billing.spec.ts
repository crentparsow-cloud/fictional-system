import { expect, test } from "@playwright/test";

/**
 * Organisation billing, join links, bulk invites, self-serve and export
 * (F-220, F-225, F-226, F-228; migration 0030). Signed out: the console
 * pages ask for sign-in, the export refuses, a join link with a bad token
 * says so and is never cached or indexed, and self-serve sign-up says
 * "Talk to us" because the org_self_serve flag is off. No price appears.
 */

for (const path of ["/org/billing", "/org/invite"]) {
  test(`${path} asks a signed-out visitor to sign in`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/sign-in\?next=/);
  });
}

for (const kind of ["roster", "seats", "invoices"]) {
  test(`the ${kind} export refuses a signed-out request`, async ({ request }) => {
    const r = await request.get(`/org/export?kind=${kind}`);
    expect(r.status()).toBe(401);
    expect(r.headers()["content-type"] ?? "").not.toMatch(/text\/csv/);
  });
}

test("a join link with an unknown token says so and is private", async ({ page }) => {
  const res = await page.goto("/org/link/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
  expect(res?.headers()["cache-control"] ?? "").toContain("no-store");
  expect(res?.headers()["referrer-policy"] ?? "").toBe("no-referrer");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("isn't working");
});

test("self-serve sign-up is closed and shows no price", async ({ page }) => {
  await page.goto("/org/start");
  await expect(page.getByRole("link", { name: "Talk to us" })).toBeVisible();
  await expect(page.locator("main")).not.toContainText(/[£$€]\s?\d/);
});
