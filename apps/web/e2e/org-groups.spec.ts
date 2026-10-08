import { expect, test } from "@playwright/test";

/**
 * Groups (F-210 to F-216). Signed out, every group page sends people to
 * sign-in and shows nothing about any group: the owner's group pages, the
 * leader view and its guide, reports and their CSV, the member's groups page
 * and the report-a-concern page.
 */

const ID = "00000000-0000-4000-8000-000000000000";

for (const path of ["/org/groups", `/org/groups/${ID}`, "/org/lead", `/org/lead/${ID}`, `/org/lead/${ID}/guide`, "/org/reports", "/groups", `/groups/concern?group=${ID}`]) {
  test(`${path} asks a signed-out visitor to sign in`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/sign-in\?next=/);
  });
}

test("the report CSV refuses a signed-out request", async ({ request }) => {
  const r = await request.get("/org/reports/csv?month=2026-09");
  expect(r.status()).toBe(401);
  expect(r.headers()["content-type"] ?? "").not.toMatch(/text\/csv/);
});
