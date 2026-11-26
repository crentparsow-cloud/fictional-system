import { describe, expect, it } from "vitest";
import { safeNextPath, sameOriginUrl } from "./safe-next";

const ORIGIN = "https://akana.example";

const HOSTILE = [
  // RT-6: the parser strips tabs and newlines, leaving "//evil.example".
  "/\t/evil.example/sign-in",
  "/\n/evil.example",
  "/\r/evil.example",
  "/\r\n/evil.example",
  "\t//evil.example",
  "/\u0000/evil.example",
  "/\u000b/evil.example",
  "/\u007f/evil.example",
  `/${String.fromCharCode(0x2028)}/evil.example`,
  `/${String.fromCharCode(0x2029)}/evil.example`,
  // Backslashes are slashes to a browser.
  "/\\evil.example",
  "/\\/evil.example",
  "\\\\evil.example",
  "/path\\..\\..//evil.example",
  // Scheme-relative and absolute.
  "//evil.example",
  "///evil.example",
  "////evil.example/",
  "https://evil.example",
  "http://evil.example",
  "HTTPS://evil.example",
  "javascript:alert(1)",
  "data:text/html,x",
  "mailto:a@evil.example",
  " /home",
  "home",
  "evil.example",
  "@evil.example",
  "?next=//evil.example",
  "#//evil.example",
  // Encoded at the front, in case anything in between decodes.
  "/%2F/evil.example",
  "/%2f%2fevil.example",
  "/%5Cevil.example",
  "/%5c/evil.example",
  "",
  `/${"a".repeat(3000)}`,
];

describe("safeNextPath", () => {
  it("keeps an ordinary path on this site, with its query and fragment", () => {
    for (const ok of ["/home", "/", "/read/a-b?unit=2&step=x#top", "/welcome?next=%2Fread%2Fa-b", "/you#check-in-partner", "/a/b/c", "/search?q=two%20words", "/x?u=https%3A%2F%2Fevil.example", "/a%2Fb", "/@handle", "/a:b"]) {
      expect(safeNextPath(ok)).toBe(ok);
      expect(sameOriginUrl(ok, ORIGIN).origin).toBe(ORIGIN);
    }
  });

  it("refuses every way of leaving the site", () => {
    for (const bad of HOSTILE) {
      expect(safeNextPath(bad), JSON.stringify(bad)).toBe("/home");
      expect(safeNextPath(bad, "/my-workbooks"), JSON.stringify(bad)).toBe("/my-workbooks");
    }
    expect(safeNextPath(null)).toBe("/home");
    expect(safeNextPath(undefined)).toBe("/home");
    expect(safeNextPath(42 as unknown as string)).toBe("/home");
    expect(safeNextPath(["/home"] as unknown as string)).toBe("/home");
  });

  it("whatever is passed, the redirect URL is on the origin it was built for", () => {
    for (const value of [...HOSTILE, "/home", "/read/x?y=1", null, undefined]) {
      const url = sameOriginUrl(value, ORIGIN);
      expect(url.origin, JSON.stringify(value)).toBe(ORIGIN);
      expect(url.href.startsWith(`${ORIGIN}/`), JSON.stringify(value)).toBe(true);
      // And a browser following the path alone would stay too.
      expect(new URL(safeNextPath(value), "https://other.example").origin).toBe("https://other.example");
    }
    expect(sameOriginUrl("/\t/evil.example", "https://books.tenant.example", "/my-workbooks").href).toBe("https://books.tenant.example/my-workbooks");
    expect(sameOriginUrl("/read/x", "http://localhost:3000").href).toBe("http://localhost:3000/read/x");
  });
});
