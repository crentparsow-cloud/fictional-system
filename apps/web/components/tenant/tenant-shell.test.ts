import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
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

function render(site: TenantSite, reader?: boolean): string {
  return renderToStaticMarkup(
    React.createElement(TenantShell as React.FC<{ site: TenantSite; reader?: boolean; children?: React.ReactNode }>, { site, ...(reader === undefined ? {} : { reader }) }, React.createElement("p", null, "Body")),
  );
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

describe("TenantShell on the reader pages (F-133)", () => {
  it("keeps every locked standard when the reader links are shown", () => {
    for (const brand of [{}, { footer_links: [{ label: "Shop", href: "https://shop.example" }] }]) {
      const html = render({ ...base, brand, isDemo: false, poweredBy: false }, true);
      expect(html).toContain('href="/help-now"');
      expect(html).toContain(TENANT_WELLNESS_NOTICE);
      expect(html).toContain(TENANT_SAFETY_LINE.replace("'", "&#x27;"));
      for (const l of LOCKED_FOOTER_LINKS) expect(html).toContain(`href="${l.href}"`);
      expect(html).toContain('data-locked="true"');
      expect(html).not.toMatch(/style=/);
      expect(html).not.toMatch(/<script/);
    }
  });

  it("shows the reader links only when asked, and Help now stays in the header beside them", () => {
    const off = render(base);
    expect(off).not.toContain('href="/my-workbooks"');
    expect(off).not.toContain('href="/account"');
    expect(render(base, false)).not.toContain('href="/my-workbooks"');
    const on = render(base, true);
    expect(on).toContain('href="/my-workbooks"');
    expect(on).toContain('href="/account"');
    const header = on.slice(on.indexOf("<header"), on.indexOf("</header>"));
    expect(header).toContain('href="/my-workbooks"');
    expect(header).toContain('href="/help-now"');
  });

  it("every page under app/site is drawn in the shell, so none can miss the locked block", () => {
    const root = join(__dirname, "..", "..", "app", "site");
    const pages: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (name === "page.tsx") pages.push(full);
      }
    };
    walk(root);
    // Home, workbook, sign-in, welcome, consent, my-workbooks, account, read. No callback: there is no sign-in link.
    expect(pages.length).toBe(8);
    expect(existsSync(join(root, "auth"))).toBe(false);
    for (const file of pages) {
      const src = readFileSync(file, "utf8");
      expect(src, file).toMatch(/import \{ TenantShell \} from "@\/components\/tenant\/TenantShell";/);
      expect(src, file).toMatch(/<TenantShell site=\{site\}/);
      // The only other thing a page may return is the unavailable page, which carries the locked block itself.
      const returns = src.match(/return\s*\(?\s*<([A-Za-z]+)/g) ?? [];
      for (const r of returns) expect(r, file).toMatch(/<(TenantShell|TenantUnavailable|Notice)$/);
      // No page of the marketplace reader shell, and no checkout, on a tenant site.
      expect(src, file).not.toMatch(/ReaderTabs|ReaderTopBar|PaywallCard|\/api\/checkout|GoogleSignIn/);
    }
  });
});
