import { expect, test } from "@playwright/test";

/**
 * Author release (M5): preview (F-038), sign-off (F-039), price (F-040),
 * author help (F-044) and the staff JSON editor (F-086). Signed out, the
 * Studio workbook pages ask for sign-in and the staff pages are closed. The
 * author help pages are static and open to anyone, with no em dashes and
 * not indexed.
 */

const W = "00000000-0000-4000-8000-000000000020";

for (const path of ["/studio/workbooks", `/studio/workbooks/${W}`, `/studio/workbooks/${W}/preview?v=${W}`]) {
  test(`${path} asks a signed-out visitor to sign in`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/sign-in\?next=/);
  });
}

test("staff editor, preview, start and submission pages need a staff session", async ({ page }) => {
  for (const path of [`/admin/review/${W}/edit`, `/admin/review/${W}/preview`, `/admin/review/start/${W}`, `/admin/review/submissions/${W}`]) {
    const res = await page.goto(path);
    expect(page.url().includes("/sign-in") || res?.status() === 404, path).toBe(true);
  }
});

test("author help index lists the five topics", async ({ page }) => {
  const res = await page.goto("/studio/help");
  expect(res!.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Help for authors");
  for (const t of ["House rules", "How review works", "Pricing", "How payment works", "The membership pool"]) {
    await expect(page.getByRole("link", { name: new RegExp(t) })).toBeVisible();
  }
  expect(await page.locator('meta[name="robots"]').getAttribute("content")).toMatch(/noindex/);
});

for (const topic of ["house-rules", "review", "pricing", "payments", "pool"]) {
  test(`/studio/help/${topic} renders in plain words`, async ({ page }) => {
    const res = await page.goto(`/studio/help/${topic}`);
    expect(res!.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const text = await page.locator("main").innerText();
    expect(text).not.toMatch(/—/);
  });
}

test("an unknown author help topic is a 404", async ({ page }) => {
  const res = await page.goto("/studio/help/not-a-topic");
  expect(res!.status()).toBe(404);
});
