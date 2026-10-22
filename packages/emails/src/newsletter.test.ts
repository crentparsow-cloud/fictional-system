import { describe, expect, it } from "vitest";
import { createDevTransport, createMailer, renderNewsletter } from "./index";

const confirm = { appUrl: "https://akana.example", confirmUrl: "https://akana.example/newsletter/confirm?t=abc" };
const issue = {
  appUrl: "https://akana.example",
  subject: "A small step for the week",
  preheader: "Five minutes, one page.",
  intro: "Here is this week's note.",
  exerciseHeading: "Write down one thing you will leave undone",
  exerciseParagraphs: ["Take a sheet of paper.", "Write one task you will not do this week."],
};
const links = { unsubscribe: "https://akana.example/newsletter/unsubscribe?t=abc", oneClick: "https://akana.example/api/newsletter/unsubscribe?t=abc" };

describe("newsletter emails (6.11)", () => {
  it("renders the confirmation as transactional with the button and no unsubscribe needed", () => {
    const r = renderNewsletter("newsletter_confirm", confirm, {}, "1 High Street, London");
    expect(r.category).toBe("transactional");
    expect(r.html).toContain("https://akana.example/newsletter/confirm?t=abc");
    expect(r.text).toContain("Confirm my address");
    expect(r.html + r.text).not.toMatch(/—/);
  });

  it("renders an issue as marketing with the exercise and the unsubscribe link", () => {
    const r = renderNewsletter("newsletter_issue", issue, links, "1 High Street, London");
    expect(r.category).toBe("marketing");
    expect(r.subject).toBe(issue.subject);
    expect(r.text).toContain("Write one task you will not do this week.");
    expect(r.html).toContain(links.unsubscribe);
    expect(r.html).not.toContain("Sponsored");
  });

  it("labels the sponsor block Sponsored and links over https only", () => {
    const sponsor = { name: "Sam Author", text: "A weekly note on small habits.", url: "https://example.test/sam" };
    const r = renderNewsletter("newsletter_issue", { ...issue, sponsor }, links, "1 High Street, London");
    expect(r.text).toContain("Sponsored");
    expect(r.html).toContain("https://example.test/sam");
    expect(() => renderNewsletter("newsletter_issue", { ...issue, sponsor: { ...sponsor, url: "http://example.test" } }, links, "x")).toThrow("newsletter_url_must_be_https");
  });

  it("refuses any title prop and an address in the subject", () => {
    expect(() => renderNewsletter("newsletter_issue", { ...issue, workbookTitle: "A Title" } as never, links, "x")).toThrow();
    expect(() => renderNewsletter("newsletter_issue", { ...issue, subject: "Mail me@example.test" }, links, "x")).toThrow();
  });

  it("the mailer refuses an issue with a placeholder postal address or no unsubscribe link", async () => {
    const { transport, sends } = createDevTransport();
    const log: unknown[] = [];
    const base = { EMAIL_FROM: "Akana <news@example.test>", EMAIL_MODE: "live" };
    const placeholder = createMailer({ env: { ...base, POSTAL_ADDRESS: "PLACEHOLDER" }, isSuppressed: () => false, log: (e) => void log.push(e), transport });
    const a = await placeholder.sendNewsletter("newsletter_issue", issue, { to: "a@b.test", links });
    expect(a.status).toBe("refused");
    expect(a.reason).toBe("postal_placeholder");
    const real = createMailer({ env: { ...base, POSTAL_ADDRESS: "1 High Street, London" }, isSuppressed: () => false, log: (e) => void log.push(e), transport });
    const b = await real.sendNewsletter("newsletter_issue", issue, { to: "a@b.test" });
    expect(b.reason).toBe("no_unsubscribe");
    expect(sends).toHaveLength(0);
    const c = await real.sendNewsletter("newsletter_issue", issue, { to: "a@b.test", links, dedupeKey: "n:1" });
    expect(c.status).toBe("sent");
    expect(sends[0]?.headers["List-Unsubscribe"]).toContain("/api/newsletter/unsubscribe");
  });

  it("sends the confirmation even before a postal address is set", async () => {
    const { transport, sends } = createDevTransport();
    const m = createMailer({ env: { EMAIL_FROM: "Akana <news@example.test>", EMAIL_MODE: "live", POSTAL_ADDRESS: "PLACEHOLDER" }, isSuppressed: () => false, log: () => {}, transport });
    const r = await m.sendNewsletter("newsletter_confirm", confirm, { to: "a@b.test" });
    expect(r.status).toBe("sent");
    expect(sends).toHaveLength(1);
  });
});
