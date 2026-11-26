import { describe, expect, it } from "vitest";
import { absoluteUrl, linkOrigin, ownOrigin, siteOrigin, siteUrl } from "./site-url";

describe("site origin (F-011)", () => {
  it("prefers NEXT_PUBLIC_SITE_URL and keeps only the origin", () => {
    expect(siteOrigin({ NEXT_PUBLIC_SITE_URL: "https://akana.example/some/path", AKANA_HOST: "other.example" })).toBe("https://akana.example");
  });

  it("falls back to AKANA_HOST with https, or http on localhost", () => {
    expect(siteOrigin({ AKANA_HOST: "akana-one.vercel.app" })).toBe("https://akana-one.vercel.app");
    expect(siteOrigin({ AKANA_HOST: "localhost:3000" })).toBe("http://localhost:3000");
  });

  it("ignores values that do not parse or are not web URLs", () => {
    expect(siteOrigin({ NEXT_PUBLIC_SITE_URL: "not a url", AKANA_HOST: "akana.example" })).toBe("https://akana.example");
    expect(siteOrigin({ NEXT_PUBLIC_SITE_URL: "javascript:alert(1)" })).toBe("http://localhost:3000");
    expect(siteOrigin({ AKANA_HOST: "bad host/with path" })).toBe("http://localhost:3000");
    expect(siteOrigin({})).toBe("http://localhost:3000");
  });

  it("gives a URL for metadataBase and absolute links", () => {
    expect(siteUrl({ AKANA_HOST: "akana.example" }).href).toBe("https://akana.example/");
    expect(absoluteUrl("/help", "https://akana.example")).toBe("https://akana.example/help");
    expect(absoluteUrl("help", "https://akana.example")).toBe("https://akana.example/help");
  });
  it("uses the Vercel address when nothing else is set", () => {
    expect(siteOrigin({ VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "akana-one.vercel.app" })).toBe("https://akana-one.vercel.app");
    expect(siteOrigin({ VERCEL_ENV: "preview", VERCEL_BRANCH_URL: "akana-git-b.vercel.app", VERCEL_URL: "akana-x.vercel.app" })).toBe("https://akana-git-b.vercel.app");
    expect(siteOrigin({ VERCEL_ENV: "preview", VERCEL_URL: "akana-x.vercel.app" })).toBe("https://akana-x.vercel.app");
    expect(siteOrigin({ AKANA_HOST: "akana.example", VERCEL_URL: "akana-x.vercel.app" })).toBe("https://akana.example");
  });
});

describe("origins for links that leave the request (review L2)", () => {
  const h = (host: string, extra: Record<string, string> = {}) => new Headers({ host, ...extra });
  const PROD = { NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://akana.example", AKANA_HOST: "akana.example", VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "akana-one.vercel.app", VERCEL_URL: "akana-abc123.vercel.app" };

  it("never builds a link from a forged Host or X-Forwarded-Host", () => {
    for (const fn of [linkOrigin, ownOrigin]) {
      expect(fn(h("evil.example"), PROD)).toBe("https://akana.example");
      expect(fn(h("akana.example", { "x-forwarded-host": "evil.example", "x-forwarded-proto": "http" }), PROD)).toBe("https://akana.example");
      expect(fn(h("akana.example.evil.example"), PROD)).toBe("https://akana.example");
      expect(fn(h("evil.example/akana.example"), PROD)).toBe("https://akana.example");
      expect(fn(h("localhost:3000"), PROD)).toBe("https://akana.example");
      expect(fn(null, PROD)).toBe("https://akana.example");
    }
  });

  it("gives scheduled mail and webhooks the one configured address, whatever host they were called on", () => {
    expect(linkOrigin(h("akana-abc123.vercel.app"), PROD)).toBe("https://akana.example");
    expect(linkOrigin(h("www.akana.example"), PROD)).toBe("https://akana.example");
  });

  it("keeps a visitor on the deployment's own address when the request came in on one", () => {
    expect(ownOrigin(h("www.akana.example"), PROD)).toBe("https://www.akana.example");
    expect(ownOrigin(h("akana-abc123.vercel.app"), PROD)).toBe("https://akana-abc123.vercel.app");
    expect(ownOrigin(h("AKANA-one.vercel.app"), PROD)).toBe("https://akana-one.vercel.app");
  });

  it("keeps preview links on the preview, even with the production host configured", () => {
    const preview = { NODE_ENV: "production", AKANA_HOST: "akana.example", VERCEL_ENV: "preview", VERCEL_BRANCH_URL: "akana-git-fix.vercel.app", VERCEL_URL: "akana-def456.vercel.app" };
    expect(ownOrigin(h("akana-git-fix.vercel.app"), preview)).toBe("https://akana-git-fix.vercel.app");
    expect(ownOrigin(h("akana-def456.vercel.app"), preview)).toBe("https://akana-def456.vercel.app");
    expect(ownOrigin(h("someone-else.vercel.app"), preview)).toBe("https://akana.example");
    // With nothing but Vercel's own variables, the branch address is the site address.
    expect(linkOrigin(h("x.example"), { VERCEL_ENV: "preview", VERCEL_BRANCH_URL: "akana-git-fix.vercel.app" })).toBe("https://akana-git-fix.vercel.app");
  });

  it("lets local work run on any port, and only when no real address is configured", () => {
    expect(linkOrigin(h("localhost:3100"), {})).toBe("http://localhost:3100");
    expect(ownOrigin(h("127.0.0.1:4000"), { NODE_ENV: "test" })).toBe("http://127.0.0.1:4000");
    expect(linkOrigin(h("evil.example"), {})).toBe("http://localhost:3000");
    expect(linkOrigin(h("localhost.evil.example"), {})).toBe("http://localhost:3000");
    expect(linkOrigin(h("localhost:3100"), { AKANA_HOST: "akana.example" })).toBe("https://akana.example");
    // .env.example sets AKANA_HOST=localhost:3000; a second local server on another port keeps its own links.
    expect(ownOrigin(h("localhost:3101"), { AKANA_HOST: "localhost:3000" })).toBe("http://localhost:3101");
    expect(linkOrigin(h("evil.example"), { AKANA_HOST: "localhost:3000" })).toBe("http://localhost:3000");
    expect(linkOrigin(h("localhost:3100"), { NEXT_PUBLIC_SITE_URL: "https://akana.example", AKANA_HOST: "localhost:3000" })).toBe("https://akana.example");
  });
});

