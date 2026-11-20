import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createMailer } from "./mailer";
import { plainSiteName, renderTenantCode, spacedCode, type TenantCodeProps } from "./tenant-code";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const catalog = JSON.parse(readFileSync(join(root, "content/catalog/catalog.json"), "utf8")) as { books: { title: string }[] };
const v3dir = join(root, "content/workbooks/v3");
const v3 = readdirSync(v3dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(v3dir, f), "utf8")) as { title: string; short_title?: string });
const titles = [...new Set([...catalog.books.map((b) => b.title), ...v3.map((w) => w.title), ...v3.map((w) => w.short_title ?? "")])].filter((t) => t.length > 6);

const props: TenantCodeProps = { siteName: "Quillmoor Press", code: "12345678", minutes: 10, supportEmail: "help@akana.example" };

describe("tenant sign-in code email (F-133)", () => {
  it("names the site in the subject and says it is powered by Akana", () => {
    const r = renderTenantCode(props, "1 Test Street, London");
    expect(r.subject).toBe("Your sign-in code for Quillmoor Press, powered by Akana");
    expect(r.subject).not.toMatch(/\d{4}/);
    expect(r.text).toContain("1234 5678");
    expect(r.text).toContain("only on Quillmoor Press");
    expect(r.text).toContain("10 minutes");
    expect(r.html).toContain("1234 5678");
  });

  it("carries no link at all", () => {
    const r = renderTenantCode(props, "1 Test Street, London");
    expect(r.text).not.toMatch(/https?:\/\//i);
    expect(r.html).not.toMatch(/<a[\s>]/i);
    expect(r.html).not.toMatch(/href=/i);
  });

  it("never names a workbook or a book, whatever the catalogue holds", () => {
    const r = renderTenantCode(props, "1 Test Street, London");
    const all = `${r.subject}\n${r.text}\n${r.html}`.toLowerCase();
    expect(titles.find((t) => all.includes(t.toLowerCase()))).toBeUndefined();
    expect(() => renderTenantCode({ ...props, workbookTitle: "X" } as unknown as TenantCodeProps)).toThrow();
  });

  it("keeps a tenant's site name to plain text that cannot smuggle a link or markup", () => {
    expect(plainSiteName("  Quillmoor   Press ")).toBe("Quillmoor Press");
    expect(plainSiteName("Good Books https://evil.example/sign-in now")).toBe("Good Books now");
    expect(plainSiteName("Books www.evil.example")).toBe("Books");
    expect(plainSiteName("<b>Books</b>\r\nBcc: x@evil.example")).toBe("b Books /b Bcc: x@evil.example");
    expect(plainSiteName("")).toBe("this site");
    expect(plainSiteName("a".repeat(200)).length).toBe(80);
    const r = renderTenantCode({ ...props, siteName: 'Books "><script>alert(1)</script> https://evil.example' }, "1 Test Street, London");
    expect(r.html).not.toMatch(/<script/i);
    expect(r.html).not.toContain("evil.example");
    expect(r.subject).not.toMatch(/[\r\n]/);
  });

  it("refuses anything that is not a numeric code", () => {
    for (const code of ["", "abc", "1234", "12345678901", "1234 5678", "https://x"]) expect(() => renderTenantCode({ ...props, code })).toThrow();
    expect(spacedCode("12345678")).toBe("1234 5678");
    expect(spacedCode("123456")).toBe("123456");
  });

  it("goes through the mailer as a transactional email, to the test recipient outside live mode", async () => {
    const sent: { to: string; subject: string }[] = [];
    const mailer = createMailer({
      env: { EMAIL_FROM: "Akana <hello@akana.example>", EMAIL_MODE: "test", TEST_RECIPIENT: "test@akana.example", POSTAL_ADDRESS: "1 Test Street, London" },
      isSuppressed: () => false,
      log: () => undefined,
      transport: async (m) => {
        sent.push({ to: m.to, subject: m.subject });
        return { ok: true, id: "1" };
      },
    });
    const res = await mailer.sendTenantCode(props, { to: "reader@example.com" });
    expect(res.status).toBe("sent_test");
    expect(res.entry.template).toBe("tenant_sign_in_code");
    expect(res.entry.category).toBe("transactional");
    expect(sent).toEqual([{ to: "test@akana.example", subject: "[Test] Your sign-in code for Quillmoor Press, powered by Akana" }]);
  });
});
