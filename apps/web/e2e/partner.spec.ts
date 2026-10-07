import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { isRemote } from "./helpers";

/**
 * The check-in partner's public token page (F-030). No sign-in, GET only
 * except one cross-site POST that must be refused before anything runs.
 *
 * A link that is malformed or unknown shows the same calm page, and every
 * response is never cached, never indexed and sends no referrer.
 */

const MALFORMED = "/respond/not-a-real-token";
// Well formed (43 base64url characters) but never minted.
const UNKNOWN = "/respond/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

function expectPrivateHeaders(h: Record<string, string>) {
  expect(h["cache-control"], "Cache-Control").toMatch(/no-store/);
  expect(h["x-robots-tag"], "X-Robots-Tag").toMatch(/noindex/);
  expect(h["referrer-policy"], "Referrer-Policy").toBe("no-referrer");
}

for (const path of [MALFORMED, UNKNOWN]) {
  test(`${path === MALFORMED ? "a malformed" : "an unknown"} token shows a calm page`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response, "no response").not.toBeNull();
    expect(response!.status()).toBeLessThan(500);
    expectPrivateHeaders(response!.headers());

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("This link isn't working");
    await expect(page.getByText("Nothing has changed.")).toBeVisible();
    // Nothing to press, and nothing about anyone.
    await expect(page.getByRole("button")).toHaveCount(0);
    await expect(page.locator("form")).toHaveCount(0);
    const body = (await page.locator("body").innerText()).toLowerCase();
    expect(body).not.toMatch(/workbook called|answers:|@/);

    const robots = await page.locator('meta[name="robots"]').getAttribute("content");
    expect(robots).toMatch(/noindex/);
    expect(await page.locator('meta[name="referrer"]').getAttribute("content")).toBe("no-referrer");
  });
}

test("the calm page has no serious or critical axe violations", async ({ page }) => {
  await page.goto(UNKNOWN);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id);
  expect(blocking).toEqual([]);
});

test("a result word on an unknown link changes nothing on the page", async ({ page }) => {
  await page.goto(`${UNKNOWN}?done=accepted`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This link isn't working");
});

test("the partner route acts only on POST", async ({ request }) => {
  const response = await request.get("/api/partner/respond?a=stop&t=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", { maxRedirects: 0 });
  expect(response.status()).toBe(405);
  expectPrivateHeaders(response.headers());
});

test("a cross-site form post is refused", async ({ request }, info) => {
  test.skip(isRemote(info), "local only: the remote project makes GET requests only");
  const response = await request.post("/api/partner/respond", {
    headers: { origin: "https://elsewhere.example", "sec-fetch-site": "cross-site", "content-type": "application/x-www-form-urlencoded" },
    data: "t=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&a=accept",
    maxRedirects: 0,
  });
  expect(response.status()).toBe(403);
  expectPrivateHeaders(response.headers());
});
