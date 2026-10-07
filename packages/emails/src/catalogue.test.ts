import { describe, expect, it } from "vitest";
import { AUTHOR_TEMPLATES } from "./author";
import { AUTHOR_TEMPLATE_CATALOGUE, READER_TEMPLATE_CATALOGUE } from "./catalogue";
import { READER_TEMPLATES } from "./reader";

describe("template catalogue", () => {
  it("lists every reader and author template, and nothing else", () => {
    expect(Object.keys(READER_TEMPLATE_CATALOGUE).sort()).toEqual(Object.keys(READER_TEMPLATES).sort());
    expect(Object.keys(AUTHOR_TEMPLATE_CATALOGUE).sort()).toEqual(Object.keys(AUTHOR_TEMPLATES).sort());
  });

  it("gives each one a single short line with no em dash", () => {
    for (const [name, line] of [...Object.entries(READER_TEMPLATE_CATALOGUE), ...Object.entries(AUTHOR_TEMPLATE_CATALOGUE)]) {
      expect(line, name).toMatch(/^\S.*\.$/);
      expect(line, name).not.toMatch(/[\n—]/);
      expect(line.length, name).toBeLessThanOrEqual(120);
    }
  });

  it("describes the membership reminders and the cancellation email", () => {
    expect(READER_TEMPLATE_CATALOGUE.membership_terms_reminder).toMatch(/six months/);
    expect(READER_TEMPLATE_CATALOGUE.cancellation).toMatch(/refund/);
  });
});
