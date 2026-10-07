import { describe, expect, it } from "vitest";
import { absoluteUrl, siteOrigin, siteUrl } from "./site-url";

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
});
