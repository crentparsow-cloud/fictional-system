import { expect, test } from "@playwright/test";

/**
 * Payouts and private files (F-099, F-135, F-143), signed out. The signed-in
 * flows need a staging payee with an authenticator and Stripe test mode, so
 * they are checked by hand for now (docs/TESTING.md).
 */

test("payouts asks a signed-out visitor to sign in", async ({ page }) => {
  await page.goto("/payouts");
  await expect(page).toHaveURL(/\/sign-in\?next=(%2F|\/)payouts/);
});

test("the step-up page asks a signed-out visitor to sign in", async ({ page }) => {
  await page.goto("/payouts/verify");
  await expect(page).toHaveURL(/\/sign-in\?next=/);
});

test("an expired Stripe link sends the payee back to press the button again", async ({ request }) => {
  const res = await request.get("/payouts/refresh?org=00000000-0000-0000-0000-000000000099", { maxRedirects: 0 });
  expect(res.status()).toBe(303);
  expect(res.headers()["location"]).toContain("/payouts?org=00000000-0000-0000-0000-000000000099&expired=1");
  expect(res.headers()["cache-control"]).toContain("no-store");
});

test("a private file cannot be opened signed out, and does not say whether it exists", async ({ request }) => {
  const res = await request.get("/files/open?path=00000000-0000-0000-0000-000000000099/licences/11111111-2222-3333-4444-555555555555.pdf", { maxRedirects: 0 });
  expect(res.status()).toBe(404);
  expect(res.headers()["cache-control"]).toContain("no-store");
  expect(res.headers()["referrer-policy"]).toBe("no-referrer");
});
