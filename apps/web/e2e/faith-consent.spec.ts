import { expect, test } from "@playwright/test";

/**
 * Faith consent (F-150). The local project runs with placeholder Supabase
 * settings and no session, so the check here is that the screen is behind
 * sign-in like the health consent screen. The full flow (consent before a
 * Faith and Spirituality workbook, withdrawal in You, 403 on save after
 * withdrawal) needs a seeded faith title and runs against a deployed site
 * once one exists; no faith workbook is seeded yet.
 */
test("/consent/faith sends a signed-out visitor to sign in", async ({ request }) => {
  const response = await request.get("/consent/faith?next=%2Flibrary", { maxRedirects: 0 });
  expect([302, 303, 307, 308]).toContain(response.status());
  const location = response.headers()["location"] ?? "";
  expect(new URL(location, "http://placeholder.invalid").pathname).toBe("/sign-in");
});
