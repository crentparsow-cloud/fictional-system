import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import type { TenantSite } from "@/lib/tenant-site";
import { LOCKED_FOOTER_LINKS, TENANT_SAFETY_LINE, TENANT_WELLNESS_NOTICE } from "@/lib/tenant-standards";

const base: TenantSite = { id: "00000000-0000-0000-0000-0000000000d1", slug: "demo", name: "Quillmoor Demo Press", brand: {}, isDemo: true, poweredBy: true };

// The test runner compiles JSX in the classic way, so the components need React in scope.
let TenantShell: typeof import("./TenantShell").TenantShell;
beforeAll(async () => {
  (globalThis as unknown as { React: typeof React }).React = React;
  ({ TenantShell } = await import("./TenantShell"));
});

function render(site: TenantSite): string {
  return renderToStaticMarkup(React.createElement(TenantShell as React.FC<{ site: TenantSite; children?: React.ReactNode }>, { site }, React.createElement("p", null, "Body")));
}

describe("TenantShell locked standards (F-068)", () => {
  it("always renders Help now, the wellness notice, the safety line and Akana's legal links", () => {
    for (const brand of [{}, { footer_links: [{ label: "Shop", href: "https://shop.example" }], sender_name: "X" }]) {
      const html = render({ ...base, brand, isDemo: false, poweredBy: false });
      expect(html).toContain('href="/help-now"');
      expect(html).toContain(TENANT_WELLNESS_NOTICE);
      expect(html).toContain(TENANT_SAFETY_LINE.replace("'", "&#x27;"));
      for (const l of LOCKED_FOOTER_LINKS) expect(html).toContain(`href="${l.href}"`);
      expect(html).toContain('data-locked="true"');
    }
  });

  it("ignores settings a brand cannot hold, even if one slipped through", () => {
    const sneaky = { ...base, brand: { hide_help_now: true, custom_css: "x" } as unknown as TenantSite["brand"] };
    const html = render(sneaky);
    expect(html).toContain('href="/help-now"');
    expect(html).not.toContain("custom_css");
    expect(html).not.toMatch(/style=/);
    expect(html).not.toMatch(/<script/);
  });

  it("labels a demo site, links the generated stylesheet and shows Powered by by plan", () => {
    const html = render(base);
    expect(html).toContain("This is a demo site.");
    expect(html).toContain("/tenant.css");
    expect(html).toContain("Powered by");
    expect(render({ ...base, poweredBy: false })).not.toContain("Powered by");
  });

  it("puts tenant links after the locked block, never instead of it", () => {
    const html = render({ ...base, brand: { legal_links: [{ label: "Publisher terms", href: "https://pub.example/terms" }] } });
    expect(html.indexOf('href="/legal/privacy"')).toBeLessThan(html.indexOf("https://pub.example/terms"));
  });
});
