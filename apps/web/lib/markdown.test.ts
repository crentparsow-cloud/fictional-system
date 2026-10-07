import { describe, expect, it } from "vitest";
import { firstHeading, firstParagraph, inlineMarkdown, markdownToHtml } from "./markdown";

describe("markdown subset (F-010, F-121)", () => {
  it("renders headings, lists, tables and paragraphs", () => {
    const html = markdownToHtml("# Title\n\nOne\ntwo.\n\n- a\n- b\n\n1. x\n2. y\n\n| H | I |\n|---|---|\n| c | d |");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<p>One two.</p>");
    expect(html).toContain("<ul><li>a</li><li>b</li></ul>");
    expect(html).toContain("<ol><li>x</li><li>y</li></ol>");
    expect(html).toContain("<th>H</th>");
    expect(html).toContain("<td>d</td>");
  });

  it("escapes markup in the source", () => {
    expect(markdownToHtml("<script>alert(1)</script>")).toBe("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
    expect(inlineMarkdown('**"bold"**')).toBe("<strong>&quot;bold&quot;</strong>");
  });

  it("links only to site paths, https and mailto", () => {
    expect(inlineMarkdown("[terms](/legal/terms)")).toBe('<a href="/legal/terms">terms</a>');
    expect(inlineMarkdown("[x](https://example.org/a)")).toBe('<a href="https://example.org/a">x</a>');
    expect(inlineMarkdown("[mail](mailto:help@example.org)")).toBe('<a href="mailto:help@example.org">mail</a>');
    expect(inlineMarkdown("[bad](javascript:alert(1))")).not.toContain("<a");
    expect(inlineMarkdown("[proto](//evil.example)")).not.toContain("<a");
    expect(inlineMarkdown("[plain](http://example.org)")).not.toContain("<a");
  });

  it("leaves square-bracket placeholders alone", () => {
    expect(inlineMarkdown("email [support email] today")).toBe("email [support email] today");
  });

  it("finds the title and the first paragraph", () => {
    const md = "# Help\n\nSee the [terms](/legal/terms) and **this**.\n\n## More\n\nLater.";
    expect(firstHeading(md)).toBe("Help");
    expect(firstParagraph(md)).toBe("See the terms and this.");
  });
});
