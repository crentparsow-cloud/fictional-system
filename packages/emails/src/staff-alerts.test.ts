import { describe, expect, it } from "vitest";
import { renderAuthor } from "./author";

describe("review_assigned", () => {
  it("names the AK code only, never a title", () => {
    const r = renderAuthor("review_assigned", { studioUrl: "https://x.test/admin/review/v1", supportEmail: "", code: "AK-AAAAA", assignedBy: "ed@x.test" });
    expect(r.subject).toBe("A workbook is ready for your review");
    expect(r.text).toContain("AK-AAAAA");
    expect(r.text).toContain("https://x.test/admin/review/v1");
  });
});

describe("ops_alert", () => {
  it("has a fixed subject and carries kind, route and code only", () => {
    const r = renderAuthor("ops_alert", {
      studioUrl: "https://x.test/admin/ops",
      supportEmail: "",
      kind: "Webhook failure",
      source: "api/stripe/webhook",
      code: "handler_failed",
      at: "7 October 2026 at 18:00",
    });
    expect(r.subject).toBe("Akana alert: something needs a look");
    expect(r.text).toContain("api/stripe/webhook");
    expect(r.text).toContain("handler_failed");
    expect(r.subject).not.toContain("webhook");
  });
});
