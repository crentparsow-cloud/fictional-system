import { describe, expect, it } from "vitest";
import { renderAuthor } from "./author";
import { type SendLogEntry, createDevTransport, createMailer } from "./mailer";

const lead = {
  studioUrl: "https://example.test/admin/leads",
  supportEmail: "support@example.test",
  leadId: "00000000-0000-0000-0000-000000000123",
  receivedAt: "6 October 2026, 10:00",
  leadName: "Ann Author",
  leadEmail: "ann@example.test",
  kind: "An author",
  bookTitle: "The Quiet Method",
  genre: "Wellbeing",
  interest: "A marketplace listing",
  message: "Please call me about The Quiet Method <b>soon</b>",
};

describe("lead_received", () => {
  it("has a fixed subject with no title, name or message", () => {
    const r = renderAuthor("lead_received", lead);
    expect(r.subject).toBe("New publishing enquiry");
    expect(r.subject).not.toContain(lead.bookTitle);
    expect(r.subject).not.toContain(lead.leadName);
    expect(r.subject).not.toContain("Please call");
  });

  it("puts the enquiry details in the body and escapes the message", () => {
    const r = renderAuthor("lead_received", lead);
    expect(r.text).toContain("ann@example.test");
    expect(r.text).toContain("The Quiet Method");
    expect(r.html).not.toContain("<b>soon</b>");
    expect(r.html).toContain("&lt;b&gt;soon&lt;/b&gt;");
  });

  it("leaves out optional rows that are empty", () => {
    const r = renderAuthor("lead_received", { ...lead, organisation: "", bookRef: undefined, message: undefined });
    expect(r.text).not.toContain("Organisation");
    expect(r.text).not.toContain("Published at");
    expect(r.text).not.toContain("Their message");
  });

  it("goes through the mailer as transactional author mail", async () => {
    const dev = createDevTransport();
    const log: SendLogEntry[] = [];
    const mailer = createMailer({ env: { EMAIL_MODE: "live", EMAIL_FROM: "Akana <hello@example.test>" }, isSuppressed: () => false, log: (e) => void log.push(e), transport: dev.transport });
    const r = await mailer.sendAuthor("lead_received", lead, { to: "team@example.test" });
    expect(r.status).toBe("sent");
    expect(log[0]?.category).toBe("transactional");
    expect(log[0]?.template).toBe("lead_received");
    expect(dev.sends[0]?.subject).toBe("New publishing enquiry");
  });
});
