import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderGift, type GiftProps } from "./gift";
import { createMailer } from "./mailer";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const catalog = JSON.parse(readFileSync(join(root, "content/catalog/catalog.json"), "utf8")) as { books: { title: string }[] };
const v3dir = join(root, "content/workbooks/v3");
const v3 = readdirSync(v3dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(v3dir, f), "utf8")) as { title: string; short_title?: string });
const titles = [...new Set([...catalog.books.map((b) => b.title), ...v3.map((w) => w.title), ...v3.map((w) => w.short_title ?? "")])].filter((t) => t.length > 6);

const props: GiftProps = { claimUrl: "https://akana.example/gift/abc", expiresOn: "20 November 2026", supportEmail: "help@akana.example" };

describe("gift email", () => {
  it("never names a workbook or a book, whatever the catalogue holds", () => {
    const r = renderGift(props, "1 Test Street, London");
    const all = `${r.subject}\n${r.text}\n${r.html}`.toLowerCase();
    const hit = titles.find((t) => all.includes(t.toLowerCase()));
    expect(hit).toBeUndefined();
  });

  it("uses a fixed subject with no address and no name", () => {
    const r = renderGift(props, "1 Test Street, London");
    expect(r.subject).toBe("A workbook has been sent to you on Akana");
    expect(r.subject).not.toMatch(/@/);
  });

  it("says no card is needed, links to the claim page and states when it expires", () => {
    const r = renderGift(props, "1 Test Street, London");
    expect(r.text).toContain("You do not need a card");
    expect(r.text).toContain("https://akana.example/gift/abc");
    expect(r.text).toContain("20 November 2026");
    expect(r.text).not.toMatch(/free\b/i);
  });

  it("refuses props that carry a title", () => {
    expect(() => renderGift({ ...props, workbookTitle: "Anything" } as unknown as GiftProps, null)).toThrow();
  });

  it("sends through the mailer as a transactional email without a consent footer", async () => {
    const logs: { status: string; template: string; category: string }[] = [];
    const mailer = createMailer({
      env: { EMAIL_MODE: "live", EMAIL_FROM: "Akana <hello@akana.example>", POSTAL_ADDRESS: "1 Test Street, London" },
      isSuppressed: () => false,
      log: (e) => void logs.push({ status: e.status, template: e.template, category: e.category }),
    });
    const res = await mailer.sendGift(props, { to: "friend@example.org" });
    expect(res.status).toBe("sent");
    expect(logs[0]).toEqual({ status: "sent", template: "gift_workbook", category: "transactional" });
    expect(mailer.devSends[0]?.to).toBe("friend@example.org");
  });
});
