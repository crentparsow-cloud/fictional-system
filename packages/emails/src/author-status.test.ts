import { describe, expect, it } from "vitest";
import { renderAuthor } from "./author";

// The author status emails (F-043): submission accepted, changes requested,
// ready for sign-off, approved, live and paused. They may name the workbook
// in the body, because the recipient wrote it, but never in the subject, and
// they carry no reader at all: the props have no field for one.
const base = { name: "Ann", workbookTitle: "The Quiet Method Workbook", studioUrl: "https://example.test/studio", supportEmail: "help@example.test" };

const cases = [
  renderAuthor("submission_accepted", base),
  renderAuthor("changes_requested", { ...base, notes: ["Unit 2 needs a gentler close."], reviewUrl: "https://example.test/studio/workbooks/x" }),
  renderAuthor("ready_for_sign_off", { ...base, signOffUrl: "https://example.test/studio/workbooks/x" }),
  renderAuthor("approved", base),
  renderAuthor("live", { ...base, liveUrl: "https://example.test/w/quiet" }),
  renderAuthor("paused", { ...base, reason: "A support line needs checking." }),
];

describe("author status emails", () => {
  it("keep the title out of every subject and put it in the body", () => {
    for (const r of cases) {
      expect(r.subject).not.toContain(base.workbookTitle);
      expect(r.text).toContain(base.workbookTitle);
    }
  });

  it("use no em dashes and link to the Studio", () => {
    for (const r of cases) {
      expect(r.text).not.toMatch(/—/);
      expect(r.subject).not.toMatch(/—/);
    }
    expect(cases[0]!.text).toContain("https://example.test/studio");
    expect(cases[3]!.text).toContain("https://example.test/studio");
  });

  it("say plainly that an approved workbook is not on sale yet", () => {
    expect(cases[3]!.text).toMatch(/not on sale yet/);
    expect(cases[0]!.subject).toBe("Your submission has been accepted");
  });
});
