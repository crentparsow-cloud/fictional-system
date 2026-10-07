import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Notice and takedown (F-123) public pages, and the gates on the earnings,
 * dashboard, roll-up, account lookup and takedown queue pages (F-041,
 * F-042, F-058, F-087). The signed-in pages need an organisation member or
 * a staff session with a second factor, so here they are only checked to
 * keep signed-out visitors out.
 */

test("the notice form asks for what DMCA and the DSA need", async ({ page }) => {
  await page.goto("/takedown");
  await expect(page.getByRole("heading", { level: 1, name: "Report content" })).toBeVisible();
  await expect(page.getByLabel("Type of notice")).toBeVisible();
  await expect(page.getByLabel("Where it is on Akana")).toBeVisible();
  await expect(page.getByLabel("Postal address")).toBeVisible();
  await expect(page.getByLabel("Signature: type your full name")).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(2);
  await expect(page.getByRole("link", { name: "Send a counter-notice" })).toHaveAttribute("href", "/takedown/counter");
});

test("the notice form shows field errors without sending", async ({ page }) => {
  await page.goto("/takedown");
  await page.getByRole("button", { name: "Send notice" }).click();
  // Without LEAD_HASH_SALT (as in a local production build) the form says it is not open yet.
  const closed = page.getByRole("alert").filter({ hasText: "not open yet" });
  const checkForm = page.getByRole("alert").filter({ hasText: "Check the form" });
  await expect(closed.or(checkForm)).toBeVisible();
  if (await closed.isVisible()) return;
  await expect(page.getByText("Choose what the notice is about")).toBeVisible();
  await expect(page.getByText("Tick this box to confirm your good faith belief")).toBeVisible();
});

test("the counter-notice form needs a reference and consent to jurisdiction", async ({ page }) => {
  await page.goto("/takedown/counter");
  await expect(page.getByRole("heading", { level: 1, name: "Send a counter-notice" })).toBeVisible();
  await expect(page.getByLabel("Notice reference")).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(3);
});

test("report content is in the info footer", async ({ page }) => {
  await page.goto("/trust");
  await expect(page.getByRole("link", { name: "Report content" })).toHaveAttribute("href", "/takedown");
});

test("takedown pages have no serious accessibility violations", async ({ page }) => {
  for (const path of ["/takedown", "/takedown/counter"]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id);
    expect(blocking, path).toEqual([]);
  }
});

test("money, counts, lookup and the takedown queue need a session", async ({ page }) => {
  for (const path of ["/studio/earnings", "/studio/dashboard", "/console/rollup", "/admin/lookup", "/admin/takedowns"]) {
    const res = await page.goto(path);
    expect(page.url().includes("/sign-in") || res?.status() === 404, path).toBe(true);
  }
  for (const path of ["/studio/dashboard/csv", "/studio/earnings/csv", "/console/rollup/csv"]) {
    const res = await page.request.get(path);
    expect([401, 404], path).toContain(res.status());
  }
});
