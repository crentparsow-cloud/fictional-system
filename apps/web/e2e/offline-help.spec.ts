import { expect, test } from "@playwright/test";

/**
 * F-140: the offline Help now page and the allowlist service worker.
 * F-017: /go/ never redirects anywhere it was not given.
 */

test("/help-offline lists dialable numbers for every market, with no script", async ({ page }) => {
  const res = await page.goto("/help-offline");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Help now" })).toBeVisible();
  for (const name of ["United Kingdom", "United States", "Canada", "Australia", "Ireland", "New Zealand"]) {
    await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
  }
  const links = page.locator('a[href^="tel:"]');
  const count = await links.count();
  expect(count).toBeGreaterThan(6);
  for (let i = 0; i < count; i++) {
    expect(await links.nth(i).getAttribute("href")).toMatch(/^tel:\+?\d{3,15}$/);
    await expect(links.nth(i)).toHaveAccessibleName(/\S/);
  }
  expect(await page.locator("script").count()).toBe(0);
});

test("/sw.js is served fresh and lists only the Help now files", async ({ request }) => {
  const res = await request.get("/sw.js");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"] ?? "").toMatch(/javascript/);
  expect(res.headers()["cache-control"] ?? "").toMatch(/no-cache/);
  const body = await res.text();
  expect(body).toContain('const PRECACHE = ["/help-offline", "/help-offline.css"];');
});

test("/go/ with an unknown workbook goes back into Akana, never elsewhere", async ({ request }) => {
  const res = await request.get("/go/not-a-real-workbook-slug", { maxRedirects: 0 });
  expect(res.status()).toBe(302);
  const location = res.headers()["location"] ?? "";
  expect(new URL(location, "https://x.example").pathname).toBe("/library");
  expect(res.headers()["cache-control"] ?? "").toMatch(/no-store/);
});

/**
 * Playwright's context.setOffline() cuts the page's network but not the
 * service worker's own fetches, so on its own it never exercises the
 * fallback: the worker reaches the server and passes the real page (here a
 * redirect to sign-in) through. To take the worker offline too, this
 * attaches to the worker over CDP and turns on offline emulation there.
 * Chromium only. One navigation per test: the emulation does not reliably
 * survive the worker handling a navigation.
 */
test("offline, a page that cannot load shows Help now", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "needs CDP to take the service worker offline");
  await page.goto("/help-now");
  const ready = await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return false;
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 8000))]);
    return !!reg;
  });
  test.skip(!ready, "service worker not registered in this build (it registers in production builds only)");
  // Let the worker take control of the page.
  await page.reload();
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  const browser = context.browser();
  if (!browser) throw new Error("no browser");
  const cdp = await browser.newBrowserCDPSession();
  const { targetInfos } = await cdp.send("Target.getTargets");
  const worker = targetInfos.find((t) => t.type === "service_worker" && t.url.endsWith("/sw.js"));
  if (!worker) throw new Error("service worker target not found");
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId: worker.targetId, flatten: false });
  let id = 0;
  const send = (method: string, params: object = {}) =>
    cdp.send("Target.sendMessageToTarget", { sessionId, message: JSON.stringify({ id: ++id, method, params }) });
  await send("Network.enable");
  await send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await context.setOffline(true);

  await page.goto("/library");
  await expect(page.getByRole("heading", { level: 1, name: "Help now" })).toBeVisible();
  await expect(page.locator('a[href^="tel:"]').first()).toBeVisible();
  await context.setOffline(false);
  await cdp.detach();
});
