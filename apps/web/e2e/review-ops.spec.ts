import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Contact form (F-090) and the counting page (F-141). Public pages only;
 * the admin pages need a staff session with a second factor.
 */

test("contact says it is not a crisis service and shows Help now first", async ({ page }) => {
  await page.goto("/contact");
  await expect(page.getByRole("heading", { level: 1, name: "Contact us" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "We are not a crisis service" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Help now" }).first()).toHaveAttribute("href", "/help-now");
  await expect(page.getByLabel("What is it about?")).toBeVisible();
  await expect(page.getByRole("option", { name: "I am worried about someone" })).toHaveCount(1);
});

test("contact form shows field errors without sending", async ({ page }) => {
  await page.goto("/contact");
  await page.getByRole("button", { name: "Send message" }).click();
  // Without LEAD_HASH_SALT (as in this local production build) the form says it is not open yet.
  const closed = page.getByRole("alert").filter({ hasText: "not open yet" });
  const checkForm = page.getByRole("alert").filter({ hasText: "Check the form" });
  await expect(closed.or(checkForm)).toBeVisible();
  if (await closed.isVisible()) return;
  await expect(page.getByText("Tick the box so we can store your message and reply")).toBeVisible();
});

test("counting page explains what is counted and offers the switch", async ({ page }) => {
  await page.goto("/counting");
  await expect(page.getByRole("heading", { level: 1, name: "What we count" })).toBeVisible();
  await expect(page.getByText("We do not record who you are")).toBeVisible();
  await page.getByRole("button", { name: "Turn counting off" }).click();
  await expect(page.getByText("We do not count your visits from this browser.")).toBeVisible();
  await page.getByRole("button", { name: "Turn counting back on" }).click();
  await expect(page.getByText("Your visits add to the daily totals.")).toBeVisible();
});

test("counting is off when the browser sends Global Privacy Control", async ({ browser }) => {
  const context = await browser.newContext({ extraHTTPHeaders: { "Sec-GPC": "1" } });
  const page = await context.newPage();
  await page.goto("/counting");
  await expect(page.getByText("Your browser asks sites not to track it")).toBeVisible();
  await context.close();
});

test("contact and counting have no serious accessibility violations", async ({ page }) => {
  for (const path of ["/contact", "/counting"]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id);
    expect(blocking, path).toEqual([]);
  }
});

test("admin review, alerts, funnel and support need a staff session", async ({ page }) => {
  for (const path of ["/admin/review", "/admin/ops", "/admin/funnel", "/admin/support"]) {
    const res = await page.goto(path);
    // Signed out: sign-in redirect, or a 404 on hosts where /admin does not exist.
    expect(page.url().includes("/sign-in") || res?.status() === 404, path).toBe(true);
  }
});
