import { expect, test, type Page } from "@playwright/test";
import { allowsOneTap, discoverDataPages, isAllowedThirdParty } from "./helpers";

/**
 * No third-party requests (F-125): while a page loads, the browser may talk
 * only to the app's own origin and Supabase. Stripe.js is allowed only on a
 * page that carries a Stripe.js script tag, and none of these pages should.
 * Google One Tap (accounts.google.com) is allowed only on paths in
 * ONE_TAP_PATHS (apps/web/csp.mjs): /sign-in and /try/:slug.
 */

const PAGES = ["/", "/help-now", "/publish", "/start", "/pricing", "/trust", "/accessibility", "/code"] as const;

/** Load a page and return every request that went somewhere it should not. */
async function offendingRequests(page: Page, baseURL: string, path: string): Promise<string[]> {
  const ownHost = new URL(baseURL).host;
  const seen: string[] = [];

  page.on("request", (req) => {
    const url = new URL(req.url());
    if (url.protocol === "data:" || url.protocol === "blob:") return;
    seen.push(url.host + url.pathname);
  });

  await page.goto(path, { waitUntil: "load" });
  await page.waitForLoadState("networkidle");

  const loadsStripe = (await page.locator('script[src^="https://js.stripe.com"]').count()) > 0;
  const oneTap = allowsOneTap(path);

  return seen.filter((entry) => {
    const host = entry.split("/")[0]!;
    if (host === ownHost) return false;
    if (oneTap && host === "accounts.google.com") return false;
    return !isAllowedThirdParty(host, loadsStripe);
  });
}

for (const path of PAGES) {
  test(`${path} makes no third-party requests`, async ({ page, baseURL }) => {
    expect(await offendingRequests(page, baseURL!, path), `third-party requests from ${path}`).toEqual([]);
  });
}

// Pages that read the catalogue run on a deployed site only.
test.describe("catalogue pages", () => {
  test.skip(!process.env.E2E_BASE_URL, "needs a deployed site with catalogue data");

  test("/explore, a shelf, a live title and a try-it title make no third-party requests", async ({ page, baseURL }) => {
    const found = await discoverDataPages(page);
    const paths = ["/explore", found.shelf, found.workbook, found.tryTitle].filter((p): p is string => !!p);
    for (const path of paths) {
      expect(await offendingRequests(page, baseURL!, path), `third-party requests from ${path}`).toEqual([]);
    }
  });

  test("Google One Tap is not loaded outside ONE_TAP_PATHS", async ({ page }) => {
    const found = await discoverDataPages(page);
    const paths = ["/", "/explore", "/start", "/pricing", "/trust", "/accessibility", "/code", found.shelf, found.workbook].filter(
      (p): p is string => !!p && !allowsOneTap(p),
    );
    for (const path of paths) {
      await page.goto(path);
      await expect(page.locator('script[src*="accounts.google.com"]'), `Google script on ${path}`).toHaveCount(0);
    }
  });
});
