import { describe, expect, it } from "vitest";
import { renderAuthor } from "./author";
import { renderReader } from "./reader";

// 0027 support operations: the refund confirmation and the deletion cancel
// to readers, the submission decline and the comment notices to authors and
// staff. None carries a title to a reader, and no comment text goes anywhere.
const reader = { name: "Sam", appUrl: "https://example.test/home", settingsUrl: "https://example.test/you", supportEmail: "help@example.test" };
const author = { name: "Ann", workbookTitle: "The Quiet Method Workbook", studioUrl: "https://example.test/studio/workbooks/x", supportEmail: "help@example.test" };

describe("support operation emails", () => {
  it("confirm a refund with the amount and whether access ended, and no title", () => {
    const ended = renderReader("refund_confirmed", { ...reader, amount: "£9.99", accessEnded: true });
    const kept = renderReader("refund_confirmed", { ...reader, amount: "£4.00", accessEnded: false });
    expect(ended.subject).toBe("Your refund is on its way");
    expect(ended.text).toContain("£9.99");
    expect(ended.text).toContain("Ended with the refund");
    expect(kept.text).toContain("You keep your access");
    expect(ended.category).toBe("transactional");
    expect(() => renderReader("refund_confirmed", { ...reader, amount: "£1", accessEnded: true, workbookTitle: "X" } as never)).toThrow(/title/);
  });

  it("confirm a deletion cancelled by support, with what to do if it was not asked for", () => {
    const r = renderReader("deletion_cancelled", reader);
    expect(r.subject).toBe("Your account will not be deleted");
    expect(r.text).toMatch(/did not ask for this/);
    expect(r.text).toContain("help@example.test");
  });

  it("decline a submission with the reason in the body and not the subject", () => {
    const r = renderAuthor("submission_declined", { ...author, reason: "It is too close to a title we already carry." });
    expect(r.subject).not.toContain(author.workbookTitle);
    expect(r.text).toContain(author.workbookTitle);
    expect(r.text).toContain("too close to a title");
  });

  it("tell each side about a comment without the comment", () => {
    const toOrg = renderAuthor("workbook_comment", author);
    const toStaff = renderAuthor("review_comment", { name: "Ed", code: "AK-T27A0", studioUrl: "https://example.test/admin/review/v", supportEmail: "" });
    expect(toOrg.subject).not.toContain(author.workbookTitle);
    expect(toOrg.text).toMatch(/only shown in the Studio/);
    expect(toStaff.text).toContain("AK-T27A0");
    expect(toStaff.text).not.toContain(author.workbookTitle);
    for (const r of [toOrg, toStaff]) expect(r.text).not.toMatch(/—/);
  });
});
