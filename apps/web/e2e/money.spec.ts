import { expect, test } from "@playwright/test";

/**
 * Royalty ledger, statements, refunds and payouts (M6: F-100 to F-103),
 * signed out. The signed-in staff flows need a staff account with an
 * authenticator and Stripe test mode, so they are checked by hand
 * (docs/TESTING.md); the money rules themselves are covered by
 * supabase/tests/0021_royalty_ledger.sql and lib/money/money.test.ts.
 */

for (const path of ["/admin/money", "/admin/money/refunds", "/admin/money/payouts", "/admin/money/statements"]) {
  test(`${path} asks a signed-out visitor to sign in`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/sign-in\?next=/);
  });
}

test("a statement file cannot be downloaded signed out", async ({ request }) => {
  const res = await request.get("/api/statements/00000000-0000-0000-0000-000000000099?format=pdf", { maxRedirects: 0 });
  expect([401, 404]).toContain(res.status());
});

test("a bad statement id is a 404", async ({ request }) => {
  const res = await request.get("/api/statements/not-a-uuid?format=csv", { maxRedirects: 0 });
  expect(res.status()).toBe(404);
});

for (const path of ["/api/money/daily", "/api/money/payout-run"]) {
  test(`${path} refuses a request without the cron secret`, async ({ request }) => {
    const res = await request.get(path, { maxRedirects: 0 });
    // 401 with CRON_SECRET set, 503 when it is not configured
    expect([401, 503]).toContain(res.status());
    expect(res.headers()["cache-control"]).toContain("no-store");
  });
}
