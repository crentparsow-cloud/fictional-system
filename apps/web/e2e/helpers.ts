import type { TestInfo } from "@playwright/test";

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
] as const;

/** Pages that must send a signed-out visitor to sign-in, keeping where they were going. */
export const GATED_PAGES = ["/library", "/admin"] as const;

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
