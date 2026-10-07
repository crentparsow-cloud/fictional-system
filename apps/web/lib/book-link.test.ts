import { describe, expect, it } from "vitest";
import { pickBookLink } from "./book-link";

describe("pickBookLink (F-017)", () => {
  const links = { GB: "https://www.amazon.co.uk/dp/X", US: "https://www.amazon.com/dp/X", AU: "http://insecure.example/dp/X" };

  it("uses the reader's market first, then GB, then US", () => {
    expect(pickBookLink(links, "US")).toBe("https://www.amazon.com/dp/X");
    expect(pickBookLink(links, "IE")).toBe("https://www.amazon.co.uk/dp/X");
    expect(pickBookLink({ US: links.US }, "CA")).toBe("https://www.amazon.com/dp/X");
    expect(pickBookLink({ NZ: "https://shop.example/x" }, null)).toBe("https://shop.example/x");
  });

  it("never follows a link that is not https, and gives null when nothing is usable", () => {
    expect(pickBookLink({ AU: links.AU }, "AU")).toBeNull();
    expect(pickBookLink({ GB: "javascript:alert(1)" }, "GB")).toBeNull();
    expect(pickBookLink(null, "GB")).toBeNull();
    expect(pickBookLink(["https://x.example"], "GB")).toBeNull();
  });
});
