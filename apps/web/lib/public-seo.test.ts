import { describe, expect, it } from "vitest";
import { absolute, breadcrumbLd, collectionPageLd, ldString, personLd } from "./public-seo";

const origin = "https://akana.example/";

describe("public structured data", () => {
  it("builds absolute URLs without doubling the slash", () => {
    expect(absolute(origin, "/themes/money")).toBe("https://akana.example/themes/money");
    expect(absolute("https://akana.example", "themes/money")).toBe("https://akana.example/themes/money");
  });

  it("lists the programmes on a listing page in order", () => {
    const ld = collectionPageLd({ origin, path: "/themes/money", name: "Money", description: "Plain money workbooks.", items: [{ name: "One", path: "/w/one" }, { name: "Two", path: "/w/two" }] });
    expect(ld["@type"]).toBe("CollectionPage");
    const list = ld.mainEntity as { numberOfItems: number; itemListElement: { position: number; url: string }[] };
    expect(list.numberOfItems).toBe(2);
    expect(list.itemListElement[1]).toMatchObject({ position: 2, url: "https://akana.example/w/two" });
  });

  it("leaves out an empty description and any non-https website", () => {
    expect("description" in collectionPageLd({ origin, path: "/x", name: "X", items: [] })).toBe(false);
    const p = personLd({ origin, path: "/authors/sam", name: "Sam", bio: "Sam writes.", website: "http://sam.test" });
    expect("sameAs" in p).toBe(false);
    expect(personLd({ origin, path: "/authors/sam", name: "Sam", website: "https://sam.test" }).sameAs).toEqual(["https://sam.test"]);
  });

  it("builds a breadcrumb trail", () => {
    const ld = breadcrumbLd(origin, [{ name: "Home", path: "/" }, { name: "Themes", path: "/themes" }]);
    expect((ld.itemListElement as { position: number }[]).map((i) => i.position)).toEqual([1, 2]);
  });

  it("escapes < so content cannot close the script tag", () => {
    expect(ldString({ name: "</script><b>" })).not.toContain("</script>");
  });
});
