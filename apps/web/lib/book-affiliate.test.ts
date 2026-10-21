import { describe, expect, it } from "vitest";
import { AFFILIATE_DISCLOSURE, affiliateDisclosure, parseAffiliateTags, withRetailerTag } from "./book-affiliate";

const tags = parseAffiliateTags('{"amazon.co.uk":"akana-21","bookshop.org":{"param":"aid","value":"1234"}}');

describe("parseAffiliateTags", () => {
  it("treats blank, bad JSON and the wrong shape as no tags", () => {
    expect(parseAffiliateTags(undefined).size).toBe(0);
    expect(parseAffiliateTags("").size).toBe(0);
    expect(parseAffiliateTags("{nope").size).toBe(0);
    expect(parseAffiliateTags("[1]").size).toBe(0);
    expect(parseAffiliateTags('"x"').size).toBe(0);
  });
  it("drops entries with unsafe hosts, parameters or values", () => {
    const t = parseAffiliateTags('{"amazon":"x","evil.com/x":"y","ok.com":"a b","fine.com":{"param":"1bad","value":"v"},"good.com":"ok"}');
    expect([...t.keys()]).toEqual(["good.com"]);
  });
});

describe("withRetailerTag", () => {
  it("adds the tag for the retailer and its subdomains", () => {
    expect(withRetailerTag("https://www.amazon.co.uk/dp/123", tags)).toBe("https://www.amazon.co.uk/dp/123?tag=akana-21");
    expect(withRetailerTag("https://bookshop.org/p/books/x?a=1", tags)).toBe("https://bookshop.org/p/books/x?a=1&aid=1234");
  });
  it("replaces a tag the link already carried", () => {
    expect(withRetailerTag("https://amazon.co.uk/dp/1?tag=someone-else", tags)).toBe("https://amazon.co.uk/dp/1?tag=akana-21");
  });
  it("leaves other retailers, plain http and bad links alone", () => {
    expect(withRetailerTag("https://example.org/book", tags)).toBe("https://example.org/book");
    expect(withRetailerTag("http://amazon.co.uk/dp/1", tags)).toBe("http://amazon.co.uk/dp/1");
    expect(withRetailerTag("not a url", tags)).toBe("not a url");
    expect(withRetailerTag("https://notamazon.co.uk/x", tags)).toBe("https://notamazon.co.uk/x");
  });
  it("is a plain link when no tags are set", () => {
    expect(withRetailerTag("https://amazon.co.uk/dp/1", parseAffiliateTags(""))).toBe("https://amazon.co.uk/dp/1");
  });
});

describe("disclosure", () => {
  it("shows only when a tag is set, in plain words", () => {
    expect(affiliateDisclosure(parseAffiliateTags(""))).toBeUndefined();
    expect(affiliateDisclosure(tags)).toBe(AFFILIATE_DISCLOSURE);
    expect(AFFILIATE_DISCLOSURE).not.toMatch(/—|\bfree\b/i);
  });
});
