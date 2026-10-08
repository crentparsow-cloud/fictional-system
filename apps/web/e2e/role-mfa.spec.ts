import { expect, test } from "@playwright/test";

/**
 * Role second factor (F-143), signed out. The signed-in flows need a staging
 * owner with an authenticator, so they are checked by hand; the database
 * rule itself is covered by supabase/tests/0032_role_mfa.sql.
 */

test("the verify page asks a signed-out visitor to sign in and keeps where they were going", async ({ page }) => {
  await page.goto("/verify?next=%2Forg%2Fbilling");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fverify%3Fnext%3D%252Forg%252Fbilling/);
});

test("the add a passkey page does not exist while passkeys are off", async ({ request }) => {
  const res = await request.get("/verify/passkey", { maxRedirects: 0 });
  expect(res.status()).toBe(404);
});
