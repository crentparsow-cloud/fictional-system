import { expect, test } from "@playwright/test";
import { isRemote } from "./helpers";

/**
 * Security headers (F-125) and host handling (F-066). GET requests only.
 */

/** Every origin-like source in a CSP directive, keywords and schemes removed. */
function originsIn(csp: string, directive: string): string[] {
  const part = csp
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.split(/\s+/)[0] === directive);
  if (!part) return [];
  return part
    .split(/\s+/)
    .slice(1)
    .filter((s) => !s.startsWith("'") && !/^[a-z][a-z0-9+.-]*:$/i.test(s));
}

test("/ sends the security headers", async ({ request }, info) => {
  const response = await request.get("/");
  expect(response.status()).toBe(200);
  const h = response.headers();

  const csp = h["content-security-policy"];
  expect(csp, "Content-Security-Policy missing").toBeTruthy();

  // No third-party script origin other than Stripe.js.
  const scriptOrigins = [
    ...originsIn(csp!, "script-src"),
    ...originsIn(csp!, "script-src-elem"),
  ];
  const fallback = scriptOrigins.length ? [] : originsIn(csp!, "default-src");
  for (const origin of [...scriptOrigins, ...fallback]) {
    expect(origin, `unexpected script origin in CSP: ${origin}`).toBe("https://js.stripe.com");
  }
  expect(csp).toMatch(/frame-ancestors 'none'/);
  expect(csp).toMatch(/object-src 'none'/);

  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");

  if (isRemote(info)) {
    const hsts = h["strict-transport-security"];
    expect(hsts, "Strict-Transport-Security missing").toBeTruthy();
    expect(hsts).toMatch(/max-age=\d{7,}/);
  }
});

test("an unknown host is refused with a 404", async ({ request }, info) => {
  test.skip(isRemote(info), "local only: a deployed host cannot be spoofed through Vercel's edge");
  const response = await request.get("/", {
    headers: { host: "not-a-tenant.e2e.invalid" },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(404);
  expect(response.headers()["x-akana-tenant"]).toBeUndefined();
});
