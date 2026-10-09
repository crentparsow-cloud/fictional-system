import { describe, expect, it } from "vitest";
import { validateBrand } from "@/lib/tenant-brand";
import { tenantPriceLine } from "@/lib/tenant-standards";
import {
  checkedColours,
  linksToText,
  parseAkCode,
  parseBrandForm,
  parseLinksText,
  parseListingForm,
  whiteLabelAbilities,
  whiteLabelErrorNotice,
} from "./white-label";

const form = (values: Record<string, string>) => (k: string) => values[k] ?? null;

describe("whiteLabelAbilities", () => {
  it("mirrors the 0023 role sets", () => {
    expect(whiteLabelAbilities(["owner"])).toEqual({ readTenants: true, editTenants: true, resetDemo: true, manageDemoLogins: true });
    expect(whiteLabelAbilities(["editor"])).toEqual({ readTenants: true, editTenants: true, resetDemo: true, manageDemoLogins: false });
    expect(whiteLabelAbilities(["support"])).toEqual({ readTenants: true, editTenants: false, resetDemo: false, manageDemoLogins: false });
    expect(Object.values(whiteLabelAbilities([])).some(Boolean)).toBe(false);
  });
});

describe("brand form", () => {
  it("builds a brand the validator accepts", () => {
    const { name, brand } = parseBrandForm(
      form({
        name: " Quillmoor ",
        light_primary: "#6B2D5C",
        light_accent: "#2e5e57",
        dark_primary: "#e4a9d3",
        dark_accent: "#1f4a44",
        font: "serif",
        logo_src: "/brand/demo/logo-a.svg",
        logo_alt: "Quillmoor",
        footer_links: "Shop | https://shop.example\n\nNews | https://news.example",
        sender_name: "Quillmoor",
      }),
    );
    expect(name).toBe("Quillmoor");
    const r = validateBrand(brand);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.brand.colours?.light.primary).toBe("#6b2d5c");
      expect(r.brand.footer_links).toHaveLength(2);
    }
  });

  it("keeps a malformed link so validation reports it", () => {
    expect(parseLinksText("just-a-url")).toEqual([{ label: "", href: "just-a-url" }]);
    expect(validateBrand({ footer_links: parseLinksText("just-a-url") }).ok).toBe(false);
    expect(linksToText([{ label: "A", href: "https://a.example" }])).toBe("A | https://a.example");
  });

  it("reads checked colours from the query only when all four are hex", () => {
    expect(checkedColours({ lp: "6b2d5c", la: "2E5E57", dp: "e4a9d3", da: "1f4a44" })).toEqual({
      light: { primary: "#6b2d5c", accent: "#2e5e57" },
      dark: { primary: "#e4a9d3", accent: "#1f4a44" },
    });
    expect(checkedColours({ lp: "6b2d5c", la: "x;}", dp: "e4a9d3", da: "1f4a44" })).toBeNull();
    expect(checkedColours({})).toBeNull();
  });
});

describe("listing form", () => {
  it("accepts ladder points only", () => {
    expect(parseListingForm(form({ visible: "on", sort: "3", price_point_id: "p2" }))).toEqual({ visible: true, featured: false, sort: 3, pricePointId: "p2" });
    expect(parseListingForm(form({ price_point_id: "member_month" }))).toBeNull();
    expect(parseListingForm(form({ sort: "1e9" }))).toBeNull();
    expect(parseAkCode("ak-dem01")).toBe("AK-DEM01");
    expect(parseAkCode("AK-DEMO1")).toBeNull(); // O is not in the code alphabet
  });

  it("maps database refusals to fixed notices", () => {
    expect(whiteLabelErrorNotice("AKW01")).toBe("brand_invalid");
    expect(whiteLabelErrorNotice("AKW03")).toBe("listing_refused");
    expect(whiteLabelErrorNotice("AKW05")).toBe("demo_login_refused");
    expect(whiteLabelErrorNotice("XX000")).toBe("failed");
  });
});

describe("tenant price line (F-069)", () => {
  it("never offers a demo title or a placeholder price", () => {
    expect(tenantPriceLine({ isDemo: true, pricePointId: "p2" })).toBe("Demo title. Not for sale.");
    expect(tenantPriceLine({ isDemo: false, pricePointId: "p2" })).toBe("£8.99. Not on sale on this site yet.");
    expect(tenantPriceLine({ isDemo: false, pricePointId: null })).toBe("Price to be confirmed");
  });
});
