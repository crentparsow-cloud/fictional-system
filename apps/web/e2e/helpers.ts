import type { Page, TestInfo } from "@playwright/test";

/** Public pages a signed-out visitor can open directly. */
export const PUBLIC_PAGES = [
  "/",
  "/help-now",
  "/publish",
  "/legal/terms",
  "/legal/privacy",
  "/legal/cookies",
  "/legal/refunds",
  "/sign-in",
  "/start",
  "/pricing",
  "/trust",
  "/accessibility",
  "/code",
] as const;

/**
 * Public pages that read the catalogue and so need a database. The local
 * build has none (placeholder Supabase settings), so these run on the remote
 * project only. See discoverDataPages for how the slugs are found.
 */
export const DATA_PUBLIC_PAGES = ["/explore"] as const;

export interface DataPages {
  shelf: string | null;
  workbook: string | null;
  /** A /try/ path for a title with safety tier none, or null if none is live. */
  tryTitle: string | null;
}

/**
 * Finds one shelf, one live title and one try-it title from the live site.
 * E2E_SHELF_SLUG, E2E_WORKBOOK_SLUG and E2E_TRY_SLUG override the search.
 * A title is a try-it title when /try/<slug> answers 200 without a redirect,
 * which is what the page does for safety tier none with a free first unit.
 */
export async function discoverDataPages(page: Page): Promise<DataPages> {
  const hrefs = async (prefix: string) =>
    (await page.locator(`main a[href^="${prefix}"]`).evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? "")))
      .filter((h) => h.length > prefix.length && !h.includes("#") && !h.includes("?"));
  await page.goto("/explore");
  const shelf = process.env.E2E_SHELF_SLUG ? `/shelves/${process.env.E2E_SHELF_SLUG}` : ((await hrefs("/shelves/"))[0] ?? null);
  const workbooks = [...new Set(await hrefs("/w/"))];
  const workbook = process.env.E2E_WORKBOOK_SLUG ? `/w/${process.env.E2E_WORKBOOK_SLUG}` : (workbooks[0] ?? null);
  let tryTitle: string | null = process.env.E2E_TRY_SLUG ? `/try/${process.env.E2E_TRY_SLUG}` : null;
  for (const w of tryTitle ? [] : workbooks.slice(0, 40)) {
    const res = await page.request.get(w.replace("/w/", "/try/"), { maxRedirects: 0 });
    if (res.status() === 200) {
      tryTitle = w.replace("/w/", "/try/");
      break;
    }
  }
  return { shelf, workbook, tryTitle };
}

/** Paths whose policy allows Google One Tap (ONE_TAP_PATHS in csp.mjs). */
export function allowsOneTap(path: string): boolean {
  return path === "/sign-in" || path.startsWith("/try/");
}

/** Pages that must send a signed-out visitor to sign-in, keeping where they were going. */
export const GATED_PAGES = ["/my-workbooks", "/admin"] as const;

export function projectName(info: TestInfo): string {
  return info.project.name;
}

export function isRemote(info: TestInfo): boolean {
  return info.project.name === "remote";
}

/** The sign-in URL a gate should send a visitor to, as path plus query. */
export function signInFor(path: string): string {
  return `/sign-in?next=${encodeURIComponent(path)}`;
}

/** Hosts the browser may talk to besides the app's own origin. */
export function isAllowedThirdParty(host: string, pageLoadsStripe: boolean): boolean {
  if (host === "supabase.co" || host.endsWith(".supabase.co")) return true;
  if (pageLoadsStripe && host === "js.stripe.com") return true;
  return false;
}
