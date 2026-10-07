import { describe, expect, it } from "vitest";
import {
  BRAND_FONTS,
  bestInk,
  brandCss,
  contrastChecks,
  contrastRatio,
  describeDbProblem,
  formatRatio,
  mix,
  validateBrand,
} from "./tenant-brand";

const LOOK_A = {
  v: 1,
  colours: { light: { primary: "#6b2d5c", accent: "#2e5e57" }, dark: { primary: "#e4a9d3", accent: "#1f4a44" } },
  font: "serif",
  logo: { src: "/brand/demo/logo-a.svg", alt: "Quillmoor Demo Press" },
  favicon: "/brand/demo/favicon-a.svg",
  sender_name: "Quillmoor Demo Press",
};
const LOOK_B = {
  ...LOOK_A,
  colours: { light: { primary: "#23395d", accent: "#8a5a12" }, dark: { primary: "#a9c4ef", accent: "#5c3d0a" } },
  font: "humanist",
};

describe("contrast", () => {
  // The same pairs as supabase/tests/0023_whitelabel_demo.sql, so the app and the database agree.
  it("matches the database figures", () => {
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.4781, 3);
    expect(contrastRatio("#1f4e5a", "#f7f5f0")).toBeCloseTo(8.3959, 3);
    expect(contrastRatio("#000000", "#ffffff")).toBe(21);
    expect(bestInk("#6b2d5c")).toBe("#ffffff");
    expect(bestInk("#e4a9d3")).toBe("#16222b");
  });

  it("rounds down for display so a near miss never reads as a pass", () => {
    expect(formatRatio(4.4999)).toBe("4.49");
    expect(formatRatio(contrastRatio("#777777", "#ffffff"))).toBe("4.47");
  });

  it("runs four checks per theme", () => {
    const checks = contrastChecks(LOOK_A.colours);
    expect(checks).toHaveLength(8);
    expect(checks.every((c) => c.pass)).toBe(true);
  });
});

describe("validateBrand", () => {
  it("accepts an empty brand and both demo looks", () => {
    expect(validateBrand({})).toEqual({ ok: true, brand: {} });
    expect(validateBrand(LOOK_A).ok).toBe(true);
    expect(validateBrand(LOOK_B).ok).toBe(true);
  });

  it("refuses settings that would unlock the standards (F-068)", () => {
    const r = validateBrand({ custom_css: "body{display:none}", hide_help_now: true, scripts: ["x"] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problems.map((p) => p.field)).toEqual(["custom_css", "hide_help_now", "scripts"]);
      expect(r.problems[0]?.message).toContain("Help now");
    }
  });

  it("reports the same failing figure as the database", () => {
    const r = validateBrand({ colours: { light: { primary: "#8a8a8a", accent: "#7a7a7a" }, dark: { primary: "#7fc2cf", accent: "#173c45" } } });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problems[0]?.message).toBe("Light theme: main colour as link text on the page is 3.16 to 1. It needs at least 4.5 to 1.");
      expect(r.problems.some((p) => p.message.startsWith("Dark theme"))).toBe(false);
      expect(r.problems.some((p) => p.message.includes("header text"))).toBe(true);
    }
    expect(describeDbProblem("contrast light primary_canvas 3.16")).toBe(
      "Light theme: main colour as link text on the page is 3.16 to 1. It needs at least 4.5 to 1.",
    );
  });

  it("checks the dark theme separately", () => {
    const same = { primary: "#1f4e5a", accent: "#1f4e5a" };
    const r = validateBrand({ colours: { light: same, dark: same } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.every((p) => p.field === "colours.dark")).toBe(true);
  });

  it("refuses unsafe or outside assets, links and text", () => {
    expect(validateBrand({ colours: { light: { primary: "#1F4E5A", accent: "#1f4e5a" }, dark: { primary: "#7fc2cf", accent: "#173c45" } } }).ok).toBe(false);
    expect(validateBrand({ logo: { src: "javascript:alert(1)", alt: "x" } }).ok).toBe(false);
    expect(validateBrand({ logo: { src: "https://evil.example/logo.svg", alt: "x" } }).ok).toBe(false);
    expect(validateBrand({ logo: { src: "/brand/demo/logo-a.svg", alt: "" } }).ok).toBe(false);
    expect(validateBrand({ logo: { src: "https://abc.supabase.co/storage/v1/object/public/brand/w/logo.png", alt: "W" } }).ok).toBe(true);
    expect(validateBrand({ footer_links: [{ label: "Shop", href: "http://example.com" }] }).ok).toBe(false);
    expect(validateBrand({ footer_links: [{ label: "<b>x</b>", href: "https://example.com" }] }).ok).toBe(false);
    expect(validateBrand({ footer_links: [{ label: "Shop", href: "https://example.com/a?b=1" }] }).ok).toBe(true);
    const five = Array.from({ length: 5 }, (_, i) => ({ label: `L${i}`, href: "https://a.example" }));
    expect(validateBrand({ legal_links: five }).ok).toBe(false);
    expect(validateBrand({ sender_name: "noreply@evil" }).ok).toBe(false);
    expect(validateBrand({ font: "comic" }).ok).toBe(false);
    expect(validateBrand([]).ok).toBe(false);
  });
});

describe("brandCss", () => {
  it("emits only custom properties under the white-label scope", () => {
    const css = brandCss(LOOK_A);
    expect(css).toContain(':root[data-tenant-kind="white_label"] {');
    expect(css).toContain("--brand: #6b2d5c;");
    expect(css).toContain("--brand-ink: #ffffff;");
    expect(css).toContain("--hero-bg: #2e5e57;");
    expect(css).toContain(`--f-display: ${BRAND_FONTS.serif.stack};`);
    expect(css).toContain("@media (prefers-color-scheme: dark)");
    expect(css).toContain(':root[data-tenant-kind="white_label"][data-theme="dark"]');
    expect(css).toContain("--brand: #e4a9d3;");
    expect(css).not.toMatch(/--help-|--rose|display:\s*none|url\(|@import|expression/);
  });

  it("gives the house look for an invalid or hostile brand", () => {
    const css = brandCss({ colours: { light: { primary: "red;}body{display:none", accent: "#000000" }, dark: { primary: "#ffffff", accent: "#000000" } } });
    expect(css).not.toContain("display:none");
    expect(css).not.toContain("--brand:");
    expect(brandCss({ custom_css: "x" })).not.toContain("--brand");
  });

  it("mixes colours for the wash", () => {
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mix("#6b2d5c", "#ffffff", 1)).toBe("#6b2d5c");
  });
});
