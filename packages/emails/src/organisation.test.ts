import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createMailer } from "./mailer";
import { ORGANISATION_PRIVACY_LINE, ORGANISATION_TEMPLATES, type OrganisationProps, type OrganisationTemplateName, renderOrganisation } from "./organisation";

/**
 * Organisation emails (F-203). An invitation from an employer or a church
 * must never name a workbook: every template is rendered and searched for
 * every title and short title in the catalogue.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
type Catalog = { books: { title: string }[] };
const catalog = JSON.parse(readFileSync(join(root, "content/catalog/catalog.json"), "utf8")) as Catalog;
const v3dir = join(root, "content/workbooks/v3");
const v3 = readdirSync(v3dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(v3dir, f), "utf8")) as { title: string; short_title?: string });
const titles = [...new Set([...catalog.books.map((b) => b.title), ...v3.map((w) => w.title), ...v3.map((w) => w.short_title ?? "")])].filter(Boolean);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const findTitle = (text: string): string | null => {
  for (const t of titles) {
    const re = /\s/.test(t) ? new RegExp(escapeRe(t), "i") : new RegExp(`(^|[^A-Za-z-])${escapeRe(t)}(?![A-Za-z-])`);
    if (re.test(text)) return t;
  }
  return null;
};

const sample: { [K in OrganisationTemplateName]: OrganisationProps[K] } = {
  seat_invite: {
    organisationName: "Harbour Logistics",
    supportEmail: "support@example.test",
    acceptUrl: "https://example.test/org/join/abc",
    declineUrl: "https://example.test/org/join/abc?no=1",
    expiresOn: "21 October 2026",
  },
  admin_invite: {
    organisationName: "Harbour Logistics",
    supportEmail: "support@example.test",
    acceptUrl: "https://example.test/org/admin-join/abc",
    consoleUrl: "https://example.test/org",
  },
};
const names = Object.keys(ORGANISATION_TEMPLATES) as OrganisationTemplateName[];

describe("organisation emails", () => {
  it("has titles to test against", () => {
    expect(titles.length).toBeGreaterThan(20);
  });

  it.each(names)("%s names no workbook or book title", (name) => {
    const r = renderOrganisation(name, sample[name] as never);
    expect(findTitle(r.subject)).toBeNull();
    expect(findTitle(r.text)).toBeNull();
    expect(findTitle(r.html)).toBeNull();
  });

  it.each(names)("%s has a fixed subject with no organisation name or address", (name) => {
    const a = renderOrganisation(name, sample[name] as never);
    const b = renderOrganisation(name, { ...sample[name], organisationName: "St Example Church" } as never);
    expect(a.subject).toBe(b.subject);
    expect(a.subject).not.toMatch(/Harbour|@/);
  });

  it.each(names)("%s carries the privacy line", (name) => {
    expect(renderOrganisation(name, sample[name] as never).text).toContain(ORGANISATION_PRIVACY_LINE);
  });

  it("the seat invitation says 18 or over, that it is a choice, and gives a way to say no", () => {
    const r = renderOrganisation("seat_invite", sample.seat_invite);
    expect(r.text).toContain("18 or over");
    expect(r.text).toContain("Taking part is your choice");
    expect(r.text).toContain("No, thank you");
    expect(r.text).toContain(sample.seat_invite.declineUrl);
    expect(r.text).toContain("21 October 2026");
  });

  it("refuses a title under any likely key", () => {
    for (const key of ["title", "workbookTitle", "bookTitle", "shortTitle", "workbookName"]) {
      expect(() => renderOrganisation("seat_invite", { ...sample.seat_invite, [key]: "Anything" } as never)).toThrow(/title/);
    }
  });

  it("escapes an organisation name that carries markup and keeps it to one line", () => {
    const r = renderOrganisation("seat_invite", { ...sample.seat_invite, organisationName: "<b>Evil</b>\nCo" });
    expect(r.html).not.toContain("<b>Evil</b>");
    expect(r.text).toContain("<b>Evil</b> Co");
  });

  it("uses no em dashes", () => {
    for (const name of names) {
      const r = renderOrganisation(name, sample[name] as never);
      expect(r.text).not.toContain("—");
    }
  });

  it("sends through the mailer as transactional mail, in test mode to the test recipient", async () => {
    const sent: { to: string; subject: string }[] = [];
    const mailer = createMailer({
      env: { EMAIL_FROM: "Akana <hello@example.test>", TEST_RECIPIENT: "inbox@example.test" },
      transport: async (m) => {
        sent.push({ to: m.to, subject: m.subject });
        return { ok: true, id: "x" };
      },
      isSuppressed: () => false,
      log: () => undefined,
    });
    const r = await mailer.sendOrganisation("seat_invite", sample.seat_invite, { to: "person@work.example" });
    expect(r.status).toBe("sent_test");
    expect(r.entry.category).toBe("transactional");
    expect(r.entry.template).toBe("organisation_seat_invite");
    expect(sent[0]).toEqual({ to: "inbox@example.test", subject: "[Test] You're invited to use Akana" });
  });
});
