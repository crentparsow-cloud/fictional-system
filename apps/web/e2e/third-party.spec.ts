import { expect, test } from "@playwright/test";
import { isAllowedThirdParty } from "./helpers";

/**
 * No third-party requests (F-125): while a page loads, the browser may talk
 * only to the app's own origin and Supabase. Stripe.js is allowed only on a
 * page that carries a Stripe.js script tag, and none of these pages should.
 */

const PAGES = ["/", "/help-now", "/publish"] as const;

for (const path of PAGES) {
  test(`${path} makes no third-party requests`, async ({ page, baseURL }) => {
    const ownHost = new URL(baseURL!).host;
    const seen: string[] = [];

    page.on("request", (req) => {
      const url = new URL(req.url());
      if (url.protocol === "data:" || url.protocol === "blob:") return;
      seen.push(url.host + url.pathname);
    });

    await page.goto(path, { waitUntil: "load" });
    await page.waitForLoadState("networkidle");

    const loadsStripe =
      (await page.locator('script[src^="https://js.stripe.com"]').count()) > 0;

    const offending = seen.filter((entry) => {
      const host = entry.split("/")[0]!;
      if (host === ownHost) return false;
      return !isAllowedThirdParty(host, loadsStripe);
    });

    expect(offending, `third-party requests from ${path}`).toEqual([]);
  });
}
