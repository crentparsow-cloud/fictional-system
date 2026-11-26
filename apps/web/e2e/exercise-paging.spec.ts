import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { isRemote, signInFor } from "./helpers";

/**
 * F-015 parity: an exercise pages one part per screen, with Back and Next
 * and progress dots without numbers, keyboard and screen-reader friendly.
 * Uses the development preview, which runs the same Player as the reader.
 *
 * The preview is staff only in production (review finding L3), like
 * /dev/kit, so the paging test needs a dev server:
 * E2E_DEV=1 E2E_BASE_URL=http://localhost:3101 pnpm e2e e2e/exercise-paging.spec.ts
 * The production build is checked for the gate instead.
 */
test("/dev/player sends a signed-out visitor to sign-in in a production build", async ({ request }, info) => {
  test.skip(isRemote(info), "the development preview is not part of a deployed check");
  const response = await request.get("/dev/player", { maxRedirects: 0 });
  expect([302, 303, 307, 308]).toContain(response.status());
  const target = new URL(response.headers()["location"] ?? "", "http://placeholder.invalid");
  expect(target.pathname + target.search).toBe(signInFor("/dev/player"));
});

test("an exercise opens from the unit list and pages with the keyboard", async ({ page }) => {
  test.skip(!process.env.E2E_DEV, "needs a dev server (E2E_DEV=1)");
  await page.goto("/dev/player");
  // The Start screen ends with "I have read this", which opens the first unit.
  await page.getByRole("button", { name: "I have read this" }).click();

  const list = page.locator(".ak-ex-list");
  await expect(list).toBeVisible();
  await list.getByRole("button").first().click();

  const pager = page.getByRole("navigation", { name: "Exercise pages" });
  await expect(pager).toBeVisible();
  // Dots: present, hidden from assistive tech, no numbers on screen.
  const dots = page.locator(".ak-dots");
  await expect(dots).toHaveAttribute("aria-hidden", "true");
  await expect(dots).toHaveText("");
  await expect(page.locator(".ak-page-h")).toContainText("Part 1 of");

  // Next by keyboard, then focus lands on the new part's heading.
  const next = pager.getByRole("button").last();
  await next.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".ak-page-h")).toContainText("Part 2 of");
  await expect(page.locator(".ak-page-h")).toBeFocused();

  await pager.getByRole("button", { name: "Back" }).click();
  await expect(page.locator(".ak-page-h")).toContainText("Part 1 of");

  const axe = await new AxeBuilder({ page }).include(".ak-exercise-paged").analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);

  await pager.getByRole("button", { name: /^Back to / }).click();
  await expect(list).toBeVisible();
});
