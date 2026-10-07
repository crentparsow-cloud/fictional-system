import { expect, test } from "@playwright/test";
import { isRemote } from "./helpers";

/**
 * The demo white-label site (F-067, F-068, F-069, F-074), reached by Host
 * header on demo.localhost, which the config map always resolves to the demo
 * tenant. Local only: a deployed host cannot be spoofed through Vercel's
 * edge. GET requests only.
 */
const DEMO = { host: "demo.localhost" };

test("a tenant host serves the tenant site and Akana's locked pages, nothing else", async ({ request }, info) => {
  test.skip(isRemote(info), "local only");
  for (const path of ["/library", "/sign-in", "/admin", "/studio", "/publish", "/pricing", "/site", "/read/anything"]) {
    const r = await request.get(path, { headers: DEMO, maxRedirects: 0 });
    expect(r.status(), `${path} on a tenant host`).toBe(404);
  }
  for (const path of ["/help-now", "/legal/privacy", "/legal/terms"]) {
    const r = await request.get(path, { headers: DEMO });
    expect(r.status(), `${path} is a locked page and must stay reachable`).toBe(200);
  }
});

test("the brand stylesheet is CSS custom properties only", async ({ request }, info) => {
  test.skip(isRemote(info), "local only");
  const r = await request.get("/tenant.css", { headers: DEMO });
  expect(r.status()).toBe(200);
  expect(r.headers()["content-type"]).toContain("text/css");
  const css = await r.text();
  expect(css).not.toMatch(/--help-|url\(|@import|<\//);
});

test("the demo home shows Help now and the wellness notice, with or without a database", async ({ request }, info) => {
  test.skip(isRemote(info), "local only");
  const r = await request.get("/", { headers: DEMO });
  // 404 until the demo has been reset on this database.
  test.skip(r.status() === 404, "demo not created on this database");
  expect(r.status()).toBe(200);
  const html = await r.text();
  if (html.includes("This site is not available right now")) {
    // No database reachable (the local e2e server has none): the site says it
    // is unavailable, and the locked standards are still in the server HTML.
    expect(html).toContain('href="/help-now"');
    expect(html).toContain('href="/legal/privacy"');
    expect(html).toContain("not treatment, therapy or medical advice");
    return;
  }
  expect(html).toContain('href="/help-now"');
  expect(html).toContain("not treatment, therapy or medical advice");
  expect(html).toContain("This is a demo site.");
  expect(html).not.toMatch(/ style="/);
});

test("/site does not exist on the marketplace", async ({ request }, info) => {
  test.skip(isRemote(info), "local only");
  const r = await request.get("/site", { maxRedirects: 0 });
  expect(r.status()).toBe(404);
});
