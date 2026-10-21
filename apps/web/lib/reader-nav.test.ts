import { describe, expect, it } from "vitest";
import { currentHref, sidebarGroups } from "./reader-nav";

describe("sidebarGroups", () => {
  it("lists the reader destinations in order, without Studio for a reader", () => {
    const { main, more } = sidebarGroups({ author: false });
    expect(main.map((i) => i.href)).toEqual(["/today", "/explore", "/my-workbooks", "/you/highlights"]);
    expect(more.map((i) => i.href)).toEqual(["/you", "/help"]);
  });
  it("adds Studio last for an author", () => {
    expect(sidebarGroups({ author: true }).main.at(-1)?.href).toBe("/studio");
  });
});

describe("currentHref", () => {
  const items = [...sidebarGroups({ author: true }).main, ...sidebarGroups({ author: true }).more];
  it("matches exact and nested paths", () => {
    expect(currentHref("/explore", items)).toBe("/explore");
    expect(currentHref("/studio/books", items)).toBe("/studio");
  });
  it("prefers the longest match", () => {
    expect(currentHref("/you/highlights", items)).toBe("/you/highlights");
    expect(currentHref("/you/habit", items)).toBe("/you");
  });
  it("does not match a sibling prefix", () => {
    expect(currentHref("/explorer", items)).toBeNull();
    expect(currentHref("/", items)).toBeNull();
  });
});
